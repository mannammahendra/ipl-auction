package com.iplauction.app.ipl_auction_mobile

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestAudioPermissions()
    }

    private fun requestAudioPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val permissions = arrayOf(
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS
            )
            val needsPermission = permissions.any {
                checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
            }
            if (needsPermission) {
                requestPermissions(permissions, 101)
            }
        }
    }
}
