import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../models/quota_snapshot.dart';

class CodexAppServerException implements Exception {
  const CodexAppServerException(this.message);
  final String message;

  @override
  String toString() => message;
}

class CodexAppServerClient {
  Process? _process;
  StreamSubscription<String>? _stdoutSubscription;
  StreamSubscription<String>? _stderrSubscription;
  final Map<int, Completer<Map<String, dynamic>>> _pending = {};
  final StreamController<QuotaSnapshot> _snapshots =
      StreamController<QuotaSnapshot>.broadcast();
  int _nextId = 1;
  String _lastStderr = '';
  bool _refreshQueued = false;

  Stream<QuotaSnapshot> get snapshots => _snapshots.stream;
  bool get isConnected => _process != null;

  Future<void> connect() async {
    if (_process != null) return;

    try {
      _process = await Process.start(
        'codex',
        const ['app-server'],
        runInShell: Platform.isWindows,
      );
    } on ProcessException catch (error) {
      throw CodexAppServerException(
        '没有找到 Codex CLI。请先安装 Codex 并完成登录。\n${error.message}',
      );
    }

    _stdoutSubscription = _process!.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen(_handleLine, onError: _handleStreamError);
    _stderrSubscription = _process!.stderr
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen((line) => _lastStderr = line);

    _process!.exitCode.then((code) {
      if (_process == null) return;
      final detail = _lastStderr.isEmpty ? '' : ': $_lastStderr';
      _failPending('Codex app-server 已退出（代码 $code）$detail');
      _process = null;
    });

    await _request('initialize', {
      'clientInfo': {
        'name': 'codex_quota_float',
        'title': 'Codex Quota Float',
        'version': '0.1.0',
      },
      'capabilities': {
        'optOutNotificationMethods': <String>[],
      },
    });
    _notify('initialized', const <String, dynamic>{});
    await refresh();
  }

  Future<QuotaSnapshot> refresh() async {
    final result = await _request('account/rateLimits/read', null);
    final snapshot = QuotaSnapshot.fromRpcResult(result);
    if (snapshot.buckets.isEmpty) {
      throw const CodexAppServerException(
        'Codex 已连接，但没有返回可显示的额度。请确认使用 ChatGPT 账号登录，而不是仅使用 API Key。',
      );
    }
    _snapshots.add(snapshot);
    return snapshot;
  }

  Future<Map<String, dynamic>> _request(
    String method,
    Map<String, dynamic>? params,
  ) async {
    final process = _process;
    if (process == null) {
      throw const CodexAppServerException('Codex app-server 尚未连接。');
    }

    final id = _nextId++;
    final completer = Completer<Map<String, dynamic>>();
    _pending[id] = completer;
    _write({
      'method': method,
      'id': id,
      if (params != null) 'params': params,
    });

    return completer.future.timeout(
      const Duration(seconds: 15),
      onTimeout: () {
        _pending.remove(id);
        throw CodexAppServerException('$method 请求超时。');
      },
    );
  }

  void _notify(String method, Map<String, dynamic> params) {
    _write({'method': method, 'params': params});
  }

  void _write(Map<String, dynamic> message) {
    final process = _process;
    if (process == null) return;
    process.stdin.writeln(jsonEncode(message));
  }

  void _handleLine(String line) {
    if (line.trim().isEmpty) return;
    late final Map<String, dynamic> message;
    try {
      message = Map<String, dynamic>.from(jsonDecode(line) as Map);
    } catch (_) {
      return;
    }

    final id = (message['id'] as num?)?.toInt();
    if (id != null && _pending.containsKey(id)) {
      final completer = _pending.remove(id)!;
      final error = message['error'];
      if (error is Map) {
        completer.completeError(
          CodexAppServerException(
            (error['message'] as String?) ?? 'Codex app-server 请求失败。',
          ),
        );
      } else {
        completer.complete(
          Map<String, dynamic>.from(message['result'] as Map? ?? const {}),
        );
      }
      return;
    }

    if (message['method'] == 'account/rateLimits/updated') {
      _queueRefresh();
    }
  }

  void _queueRefresh() {
    if (_refreshQueued || _process == null) return;
    _refreshQueued = true;
    Timer(const Duration(milliseconds: 500), () async {
      _refreshQueued = false;
      try {
        await refresh();
      } catch (_) {
        // The periodic refresh in the controller will retry.
      }
    });
  }

  void _handleStreamError(Object error) {
    _failPending('读取 Codex app-server 输出失败：$error');
  }

  void _failPending(String message) {
    for (final completer in _pending.values) {
      if (!completer.isCompleted) {
        completer.completeError(CodexAppServerException(message));
      }
    }
    _pending.clear();
  }

  Future<void> close() async {
    final process = _process;
    _process = null;
    await _stdoutSubscription?.cancel();
    await _stderrSubscription?.cancel();
    _failPending('连接已关闭。');
    process?.kill();
    await _snapshots.close();
  }
}

