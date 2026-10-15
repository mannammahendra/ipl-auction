import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'theme/app_theme.dart';
import 'screens/webview_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  runApp(const IplAuctionApp());
}

class IplAuctionApp extends StatelessWidget {
  const IplAuctionApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'IPL Auction',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const WebViewScreen(),
    );
  }
}
