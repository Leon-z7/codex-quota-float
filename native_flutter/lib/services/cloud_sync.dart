import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/quota_snapshot.dart';

class CloudSync {
  CloudSync(this.client);

  final SupabaseClient client;

  User get _user {
    final user = client.auth.currentUser;
    if (user == null) throw StateError('请先登录同步账户。');
    return user;
  }

  Future<void> upload(QuotaSnapshot snapshot) async {
    final now = DateTime.now().toUtc().toIso8601String();
    await client.from('quota_snapshots').upsert({
      'user_id': _user.id,
      'payload': snapshot.toJson(),
      'source_updated_at': snapshot.updatedAt.toUtc().toIso8601String(),
      'updated_at': now,
    }, onConflict: 'user_id');
  }

  Future<QuotaSnapshot?> download() async {
    final row = await client
        .from('quota_snapshots')
        .select('payload')
        .eq('user_id', _user.id)
        .maybeSingle();
    if (row == null || row['payload'] is! Map) return null;
    return QuotaSnapshot.fromJson(
      Map<String, dynamic>.from(row['payload'] as Map),
    );
  }
}

