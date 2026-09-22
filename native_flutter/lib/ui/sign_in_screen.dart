import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, this.configMissing = false, this.compact = false});

  final bool configMissing;
  final bool compact;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _message;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit({required bool create}) async {
    if (_email.text.trim().isEmpty || _password.text.length < 6) {
      setState(() => _message = '请输入邮箱，密码至少 6 位。');
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final auth = Supabase.instance.client.auth;
      if (create) {
        final response = await auth.signUp(
          email: _email.text.trim(),
          password: _password.text,
        );
        if (response.session == null) {
          _message = '注册成功，请查收验证邮件后再登录。';
        }
      } else {
        await auth.signInWithPassword(
          email: _email.text.trim(),
          password: _password.text,
        );
      }
    } on AuthException catch (error) {
      _message = error.message;
    } catch (error) {
      _message = '操作失败：$error';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.configMissing) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Text(
              '尚未配置云同步。请按照 README 创建 config.json，'
              '再使用 --dart-define-from-file=config.json 启动。',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
        ),
      );
    }

    final form = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '额度同步账户',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        const Text(
          'Windows 和 iPhone 使用同一账户。这里不是 ChatGPT 密码。',
          style: TextStyle(color: Color(0xFFAAA8B5)),
        ),
        const SizedBox(height: 18),
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
          decoration: const InputDecoration(
            labelText: '邮箱',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: true,
          autofillHints: const [AutofillHints.password],
          decoration: const InputDecoration(
            labelText: '同步账户密码',
            border: OutlineInputBorder(),
          ),
        ),
        if (_message != null) ...[
          const SizedBox(height: 12),
          Text(_message!, style: const TextStyle(color: Color(0xFFFFB454))),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : () => _submit(create: false),
          child: Text(_busy ? '处理中…' : '登录'),
        ),
        TextButton(
          onPressed: _busy ? null : () => _submit(create: true),
          child: const Text('首次使用：创建同步账户'),
        ),
      ],
    );

    if (widget.compact) return form;
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: form,
          ),
        ),
      ),
    );
  }
}

