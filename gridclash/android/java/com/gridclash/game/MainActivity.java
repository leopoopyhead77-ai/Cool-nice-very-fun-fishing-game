package com.gridclash.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Hosts the game: one self-contained HTML file in assets, shown full-screen
 * (immersive, landscape) in a WebView.
 *
 * Native code only adds durable settings storage (SharedPreferences, reached
 * from the page as window.AndroidStore). When online play arrives it will talk
 * to its servers from the page itself.
 */
public class MainActivity extends Activity {

    private WebView web;

    /** Storage the page reaches through window.AndroidStore. */
    public static class Store {
        private final SharedPreferences prefs;

        Store(Context ctx) {
            this.prefs = ctx.getSharedPreferences("gridclash", Context.MODE_PRIVATE);
        }

        @JavascriptInterface
        public String get(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void set(String key, String value) {
            prefs.edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public void remove(String key) {
            prefs.edit().remove(key).apply();
        }
    }

    /**
     * Lets the page lock the screen: portrait for local 2-player (one player
     * at each end of the upright phone), landscape for everything else.
     * Reached from the page as window.AndroidApp.
     */
    public static class AppBridge {
        private final MainActivity activity;

        AppBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void setOrientation(String o) {
            activity.runOnUiThread(new ApplyOrientation(activity, "portrait".equals(o)));
        }
    }

    // Static and named on purpose: d8 from build-tools 34 crashes on inner
    // (non-static) and anonymous classes produced by newer javac versions.
    static class ApplyOrientation implements Runnable {
        private final MainActivity activity;
        private final boolean portrait;

        ApplyOrientation(MainActivity activity, boolean portrait) {
            this.activity = activity;
            this.portrait = portrait;
        }

        @Override
        public void run() {
            activity.setRequestedOrientation(portrait
                    ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                    : ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            activity.hideSystemUi();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        w.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.parseColor("#0B0F18"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setHapticFeedbackEnabled(true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        web.addJavascriptInterface(new Store(this), "AndroidStore");
        web.addJavascriptInterface(new AppBridge(this), "AndroidApp");
        web.setWebViewClient(new WebViewClient());

        setContentView(web);
        hideSystemUi();
        web.loadUrl("file:///android_asset/index.html");
    }

    @SuppressWarnings("deprecation")
    void hideSystemUi() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        hideSystemUi();
    }

    @Override
    public void onBackPressed() {
        // Back opens the in-game pause menu instead of killing a match.
        if (web != null) {
            web.evaluateJavascript(
                    "window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));"
                            + "window.dispatchEvent(new KeyboardEvent('keyup',{code:'Escape'}));",
                    null);
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
