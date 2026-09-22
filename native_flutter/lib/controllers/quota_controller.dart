import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../models/quota_snapshot.dart';
import '../services/cloud_sync.dart';
import '../services/codex_app_server.dart';

class QuotaController extends ChangeNotifier {
  QuotaController({this.cloudSync});

  final CloudSync? cloudSync;
  CodexAppServerClient? _codex;
  StreamSubscription<QuotaSnapshot>? _codexSubscription;
  Timer? _timer;

  QuotaSnapshot? snapshot;
  String? error;
  bool loading = true;
  bool cloudConnected = false;

  Future<void> initialize() async {
    if (Platform.isWindows) {
      await _startWindowsSource();
    } else {
      await _refreshCloud();
      _timer = Timer.periodic(
        const Duration(seconds: 30),
        (_) => _refreshCloud(silent: true),
      );
    }
  }

  Future<void> _startWindowsSource() async {
    _codex = CodexAppServerClient();
    _codexSubscription = _codex!.snapshots.listen(_acceptLocalSnapshot);
    try {
      await _codex!.connect();
      error = null;
    } catch (exception) {
      error = exception.toString();
      loading = false;
      notifyListeners();
    }

    _timer = Timer.periodic(const Duration(minutes: 1), (_) => refresh());
  }

  Future<void> _acceptLocalSnapshot(QuotaSnapshot value) async {
    snapshot = value;
    error = null;
    loading = false;
    notifyListeners();
    final cloud = cloudSync;
    if (cloud != null) {
      try {
        await cloud.upload(value);
        cloudConnected = true;
        notifyListeners();
      } catch (exception) {
        cloudConnected = false;
        error = '本机额度读取正常，但云同步失败：$exception';
        notifyListeners();
      }
    }
  }

  Future<void> _refreshCloud({bool silent = false}) async {
    final cloud = cloudSync;
    if (cloud == null) {
      error = '尚未配置云同步。';
      loading = false;
      notifyListeners();
      return;
    }
    if (!silent) {
      loading = true;
      notifyListeners();
    }
    try {
      final value = await cloud.download();
      snapshot = value;
      cloudConnected = true;
      error = value == null ? '云端还没有额度数据，请先在 Windows 端运行一次。' : null;
    } catch (exception) {
      cloudConnected = false;
      error = '读取云端额度失败：$exception';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    if (Platform.isWindows) {
      loading = snapshot == null;
      notifyListeners();
      try {
        await _codex?.refresh();
      } catch (exception) {
        error = exception.toString();
        loading = false;
        notifyListeners();
      }
    } else {
      await _refreshCloud();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _codexSubscription?.cancel();
    _codex?.close();
    super.dispose();
  }
}

