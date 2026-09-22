import 'dart:io';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:window_manager/window_manager.dart';

import 'services/cloud_sync.dart';
import 'ui/home_screen.dart';
import 'ui/sign_in_screen.dart';

const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabasePublishableKey =
    String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');

bool get hasCloudConfig =>
    supabaseUrl.isNotEmpty && supabasePublishableKey.isNotEmpty;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (hasCloudConfig) {
    await Supabase.initialize(
      url: supabaseUrl,
      publishableKey: supabasePublishableKey,
    );
  }

  if (Platform.isWindows) {
    await windowManager.ensureInitialized();
    const options = WindowOptions(
      size: Size(540, 118),
      minimumSize: Size(420, 108),
      backgroundColor: Colors.transparent,
      titleBarStyle: TitleBarStyle.hidden,
      windowButtonVisibility: false,
      skipTaskbar: false,
    );
    await windowManager.waitUntilReadyToShow(options, () async {
      await windowManager.setAlwaysOnTop(true);
      await windowManager.setAlignment(Alignment.topRight);
      await windowManager.show();
      await windowManager.focus();
    });
  }

  runApp(const QuotaFloatApp());
}

class QuotaFloatApp extends StatelessWidget {
  const QuotaFloatApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Codex 额度条',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF8B5CF6),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: Platform.isWindows
            ? Colors.transparent
            : const Color(0xFF0B0B10),
        useMaterial3: true,
      ),
      home: const _SessionRouter(),
    );
  }
}

class _SessionRouter extends StatelessWidget {
  const _SessionRouter();

  @override
  Widget build(BuildContext context) {
    if (!hasCloudConfig) {
      return Platform.isWindows
          ? const HomeScreen(cloudSync: null)
          : const SignInScreen(configMissing: true);
    }

    final client = Supabase.instance.client;
    return StreamBuilder<AuthState>(
      stream: client.auth.onAuthStateChange,
      initialData: AuthState(
        AuthChangeEvent.initialSession,
        client.auth.currentSession,
      ),
      builder: (context, snapshot) {
        final signedIn = snapshot.data?.session != null;
        if (Platform.isWindows) {
          return HomeScreen(
            key: ValueKey(snapshot.data?.session?.user.id ?? 'local'),
            cloudSync: signedIn ? CloudSync(client) : null,
          );
        }
        return signedIn
            ? HomeScreen(cloudSync: CloudSync(client))
            : const SignInScreen();
      },
    );
  }
}

