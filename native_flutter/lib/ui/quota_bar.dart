import 'dart:io';

import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import '../models/quota_snapshot.dart';

class QuotaBar extends StatelessWidget {
  const QuotaBar({
    super.key,
    required this.snapshot,
    required this.loading,
    required this.onRefresh,
    required this.onToggleExpanded,
    required this.expanded,
  });

  final QuotaSnapshot? snapshot;
  final bool loading;
  final VoidCallback onRefresh;
  final VoidCallback onToggleExpanded;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final windows = snapshot?.allWindows.take(2).toList() ?? const <QuotaWindow>[];
    return Material(
      color: Colors.transparent,
      child: Container(
        height: 92,
        margin: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: const Color(0xF2191922),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x66000000),
              blurRadius: 20,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          children: [
            if (Platform.isWindows)
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onPanStart: (_) => windowManager.startDragging(),
                child: const SizedBox(
                  width: 28,
                  height: double.infinity,
                  child: Icon(Icons.drag_indicator_rounded, size: 18),
                ),
              )
            else
              const SizedBox(width: 14),
            Expanded(
              child: windows.isEmpty
                  ? Row(
                      children: [
                        if (loading)
                          const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        else
                          const Icon(Icons.hourglass_empty_rounded, size: 20),
                        const SizedBox(width: 10),
                        Text(loading ? '正在读取 Codex 额度…' : '暂无额度数据'),
                      ],
                    )
                  : Row(
                      children: [
                        for (var index = 0; index < windows.length; index++) ...[
                          if (index > 0) const SizedBox(width: 16),
                          Expanded(child: _WindowMeter(window: windows[index])),
                        ],
                      ],
                    ),
            ),
            IconButton(
              tooltip: '刷新',
              onPressed: loading ? null : onRefresh,
              icon: const Icon(Icons.refresh_rounded, size: 20),
            ),
            IconButton(
              tooltip: expanded ? '收起详情' : '展开详情',
              onPressed: onToggleExpanded,
              icon: Icon(
                expanded
                    ? Icons.keyboard_arrow_up_rounded
                    : Icons.keyboard_arrow_down_rounded,
                size: 22,
              ),
            ),
            if (Platform.isWindows)
              IconButton(
                tooltip: '关闭',
                onPressed: windowManager.close,
                icon: const Icon(Icons.close_rounded, size: 19),
              )
            else
              const SizedBox(width: 4),
          ],
        ),
      ),
    );
  }
}

class _WindowMeter extends StatelessWidget {
  const _WindowMeter({required this.window});
  final QuotaWindow window;

  @override
  Widget build(BuildContext context) {
    final remaining = window.remainingPercent;
    final color = remaining > 35
        ? const Color(0xFF55D6A8)
        : remaining > 15
            ? const Color(0xFFFFB454)
            : const Color(0xFFFF6B7A);

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              window.durationLabel,
              style: const TextStyle(fontSize: 12, color: Color(0xFFB9B8C5)),
            ),
            const Spacer(),
            Text(
              '剩余 ${remaining.toStringAsFixed(0)}%',
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ],
        ),
        const SizedBox(height: 7),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(
            value: remaining / 100,
            minHeight: 7,
            color: color,
            backgroundColor: Colors.white.withValues(alpha: 0.10),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '重置 ${_formatReset(window.resetsAt)}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 10, color: Color(0xFF858391)),
        ),
      ],
    );
  }

  String _formatReset(DateTime value) {
    final now = DateTime.now();
    final sameDay = value.year == now.year &&
        value.month == now.month &&
        value.day == now.day;
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');
    if (sameDay) return '今天 $hour:$minute';
    return '${value.month}月${value.day}日 $hour:$minute';
  }
}

