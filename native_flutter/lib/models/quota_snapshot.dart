class QuotaWindow {
  const QuotaWindow({
    required this.usedPercent,
    required this.windowDurationMinutes,
    required this.resetsAt,
  });

  final double usedPercent;
  final int windowDurationMinutes;
  final DateTime resetsAt;

  double get remainingPercent => (100 - usedPercent).clamp(0, 100).toDouble();

  String get durationLabel {
    if (windowDurationMinutes >= 10080) return '周额度';
    if (windowDurationMinutes >= 1440) {
      return '${(windowDurationMinutes / 1440).round()} 天';
    }
    if (windowDurationMinutes >= 60) {
      return '${(windowDurationMinutes / 60).round()} 小时';
    }
    return '$windowDurationMinutes 分钟';
  }

  factory QuotaWindow.fromJson(Map<String, dynamic> json) {
    final resetSeconds = (json['resetsAt'] as num?)?.toInt() ?? 0;
    return QuotaWindow(
      usedPercent: (json['usedPercent'] as num?)?.toDouble() ?? 0,
      windowDurationMinutes:
          (json['windowDurationMins'] as num?)?.toInt() ?? 0,
      resetsAt: DateTime.fromMillisecondsSinceEpoch(
        resetSeconds * 1000,
        isUtc: true,
      ).toLocal(),
    );
  }

  Map<String, dynamic> toJson() => {
        'usedPercent': usedPercent,
        'windowDurationMins': windowDurationMinutes,
        'resetsAt': resetsAt.toUtc().millisecondsSinceEpoch ~/ 1000,
      };
}

class QuotaBucket {
  const QuotaBucket({
    required this.id,
    required this.name,
    this.primary,
    this.secondary,
  });

  final String id;
  final String name;
  final QuotaWindow? primary;
  final QuotaWindow? secondary;

  factory QuotaBucket.fromJson(String id, Map<String, dynamic> json) {
    QuotaWindow? parseWindow(dynamic value) {
      if (value is Map<String, dynamic>) return QuotaWindow.fromJson(value);
      if (value is Map) {
        return QuotaWindow.fromJson(Map<String, dynamic>.from(value));
      }
      return null;
    }

    return QuotaBucket(
      id: id,
      name: (json['limitName'] as String?)?.trim().isNotEmpty == true
          ? json['limitName'] as String
          : id,
      primary: parseWindow(json['primary']),
      secondary: parseWindow(json['secondary']),
    );
  }

  Map<String, dynamic> toJson() => {
        'limitId': id,
        'limitName': name,
        'primary': primary?.toJson(),
        'secondary': secondary?.toJson(),
      };
}

class QuotaSnapshot {
  const QuotaSnapshot({
    required this.buckets,
    required this.updatedAt,
    this.planType,
  });

  final List<QuotaBucket> buckets;
  final DateTime updatedAt;
  final String? planType;

  Iterable<QuotaWindow> get allWindows sync* {
    for (final bucket in buckets) {
      if (bucket.primary != null) yield bucket.primary!;
      if (bucket.secondary != null) yield bucket.secondary!;
    }
  }

  factory QuotaSnapshot.fromRpcResult(Map<String, dynamic> result) {
    final rawBuckets = result['rateLimitsByLimitId'];
    final buckets = <QuotaBucket>[];

    if (rawBuckets is Map) {
      for (final entry in rawBuckets.entries) {
        if (entry.value is Map) {
          buckets.add(QuotaBucket.fromJson(
            entry.key.toString(),
            Map<String, dynamic>.from(entry.value as Map),
          ));
        }
      }
    }

    if (buckets.isEmpty && result['rateLimits'] is Map) {
      final raw = Map<String, dynamic>.from(result['rateLimits'] as Map);
      final id = (raw['limitId'] as String?) ?? 'codex';
      buckets.add(QuotaBucket.fromJson(id, raw));
    }

    return QuotaSnapshot(
      buckets: buckets,
      updatedAt: DateTime.now(),
      planType: result['planType'] as String?,
    );
  }

  factory QuotaSnapshot.fromJson(Map<String, dynamic> json) {
    final rawBuckets = json['buckets'] as List<dynamic>? ?? const [];
    return QuotaSnapshot(
      buckets: rawBuckets
          .whereType<Map>()
          .map((raw) {
            final map = Map<String, dynamic>.from(raw);
            final id = (map['limitId'] as String?) ?? 'codex';
            return QuotaBucket.fromJson(id, map);
          })
          .toList(growable: false),
      updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? '')?.toLocal() ??
          DateTime.now(),
      planType: json['planType'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'buckets': buckets.map((bucket) => bucket.toJson()).toList(),
        'updatedAt': updatedAt.toUtc().toIso8601String(),
        'planType': planType,
      };
}

