import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ipl_auction_mobile/theme/app_theme.dart';
import 'package:ipl_auction_mobile/screens/webview_screen.dart';

void main() {
  group('AppTheme Unit Tests', () {
    test('AppTheme loads dark theme correctly with brand background', () {
      final theme = AppTheme.darkTheme;
      expect(theme.brightness, Brightness.dark);
      expect(theme.scaffoldBackgroundColor, const Color(0xFF0A0E1A));
      expect(theme.primaryColor, AppTheme.primaryAmber);
    });

    test('AppTheme color scheme matches IPL Auction gold brand specifications', () {
      final theme = AppTheme.darkTheme;
      expect(theme.colorScheme.primary, const Color(0xFFF59E0B));
      expect(theme.colorScheme.secondary, const Color(0xFFF97316));
      expect(theme.colorScheme.surface, const Color(0xFF111827));
      expect(theme.colorScheme.error, const Color(0xFFF43F5E));
      expect(theme.colorScheme.onPrimary, Colors.black);
    });

    test('AppTheme card and button themes are configured for high-contrast UI', () {
      final theme = AppTheme.darkTheme;
      expect(theme.cardTheme.elevation, 4);
      expect(theme.cardTheme.color, AppTheme.surface);
    });
  });

  group('WebViewScreen Configuration Tests', () {
    test('WebViewScreen defaults to production cloud URL', () {
      const screen = WebViewScreen();
      expect(screen.initialUrl, 'https://ipl-auction-frontend-sj8t.onrender.com');
    });

    test('WebViewScreen accepts custom room URL parameter', () {
      const customUrl = 'https://ipl-auction-frontend-sj8t.onrender.com/?join=ROOM123';
      const screen = WebViewScreen(initialUrl: customUrl);
      expect(screen.initialUrl, customUrl);
    });
  });
}
