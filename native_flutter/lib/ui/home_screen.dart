import 'dart:io';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:window_manager/window_manager.dart';

import '../controllers/quota_controller.dart';
import '../services/cloud_sync.dart';
import 'quota_bar.dart';
import 'sign_in_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.cloudSync});

  final CloudSync? cloudSync;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final QuotaController controller;
  bool expanded = false;

  @override
  void initState() {
    super.initState();
    controller = QuotaController(cloudSync: widget.cloudSync);
    controller.addListener(_rebuild);
    controller.initialize();
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    controller.removeListener(_rebuild);
    controller.dispose();
    super.dispose();
  }

  Future<void> _toggleExpanded() async {
    setState(() => expanded = !expanded);
    if (Platform.isWindows) {
      await windowManager.setSize(Size(540, expanded ? 500 : 118), animate: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isWindows = Platform.isWindows;
    return Scaffold(
      backgroundColor: isWindows ? Colors.transparent : const Color(0xFF0B0B10),
      body: SafeArea(
        top: !isWindows,
        child: Stack(
          children: [
            if (!isWindows || expanded)
              Positioned.fill(
                child: Container(
                  margin: EdgeInsets.only(
                    top: isWindows ? 102 : 96,
                    left: isWindows ? 10 : 16,
                    right: isWindows ? 10 : 16,
                    bottom: isWindows ? 10 : 16,
                  ),
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: const Color(0xF2191922),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.08),
                    ),
                  ),
                  child: SingleChildScrollView(child: _details()),
                ),
              ),
            Align(
              alignment: Alignment.topCenter,
              child: QuotaBar(
                snapshot: controller.snapshot,
                loading: controller.loading,
                onRefresh: controller.refresh,
                onToggleExpanded: _toggleExpanded,
                expanded: expanded,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _details() {
    final snapshot = controller.snapshot;
    final user = hasSupabaseSession ? Supabase.instance.client.auth.currentUser : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Text('连接状态', style: TextStyle(fontWeight: FontWeight.w700)),
            const Spacer(),
            _StatusChip(
              ok: Platform.isWindows ? snapshot != null : controller.cloudConnected,
              text: Platform.isWindows ? 'Codex 本机' : '云端同步',
            ),
            if (user != null) ...[
              const SizedBox(width: 8),
              _StatusChip(ok: controller.cloudConnected, text: '跨设备'),
            ],
          ],
        ),
        if (snapshot != null) ...[
          const SizedBox(height: 12),
          Text(
            '最近更新：${_formatTime(snapshot.updatedAt)}'
            '${snapshot.planType == null ? '' : ' · ${snapshot.planType}'}',
            style: const TextStyle(color: Color(0xFFAAA8B5)),
          ),
        ],
        if (controller.error != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0x22FFB454),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              controller.error!,
              style: const TextStyle(color: Color(0xFFFFC477)),
            ),
          ),
        ],
        const SizedBox(height: 18),
        if (Platform.isWindows && hasSupabaseSession && user == null)
          const SignInScreen(compact: true)
        else if (user != null) ...[
          Text(
            '同步账户：${user.email ?? user.id}',
            style: const TextStyle(color: Color(0xFFAAA8B5)),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => Supabase.instance.client.auth.signOut(),
            icon: const Icon(Icons.logout_rounded),
            label: const Text('退出同步账户'),
          ),
        ] else if (Platform.isWindows) ...[
          const Text(
            '当前仅在本机显示。若要让 iPhone 在其他网络查看，请按 README 配置云同步。',
            style: TextStyle(color: Color(0xFFAAA8B5)),
          ),
        ],
        if (!Platform.isWindows) ...[
          const SizedBox(height: 14),
          const Text(
            'iOS 只能在本应用内显示此悬浮条，不能覆盖到其他应用上。',
            style: TextStyle(color: Color(0xFF858391), fontSize: 12),
          ),
        ],
      ],
    );
  }

  bool get hasSupabaseSession {
    try {
      Supabase.instance.client;
      return true;
    } catch (_) {
      return false;
    }
  }

  String _formatTime(DateTime value) {
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');
    final second = value.second.toString().padLeft(2, '0');
    return '${value.month}月${value.day}日 $hour:$minute:$second';
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.ok, required this.text});
  final bool ok;
  final String text;

  @override
  Widget build(BuildContext context) {
    final color = ok ? const Color(0xFF55D6A8) : const Color(0xFF858391);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(text, style: TextStyle(color: color, fontSize: 11)),
        ],
      ),
    );
  }
}

