import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ipl_auction_mobile/theme/app_theme.dart';

void main() {
  test('AppTheme loads dark theme correctly', () {
    final theme = AppTheme.darkTheme;
    expect(theme.brightness, Brightness.dark);
    expect(theme.scaffoldBackgroundColor, const Color(0xFF0A0E1A));
  });
}
