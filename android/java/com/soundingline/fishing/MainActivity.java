package com.soundingline.fishing;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Hosts the game, which is a single self-contained HTML file in assets.
 *
 * The only thing the native side provides is durable storage: a file:// page
 * cannot be relied on to keep localStorage across Android versions, so saves
 * go through SharedPreferences via {@link SaveBridge}.
 */
public class MainActivity extends Activity {

    private WebView web;

    /** Storage the page reaches through window.AndroidStore. */
    public static class SaveBridge {
        private final SharedPreferences prefs;

        SaveBridge(Context ctx) {
            this.prefs = ctx.getSharedPreferences("sounding-line", Context.MODE_PRIVATE);
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

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
            WebView.setWebContentsDebuggingEnabled(false);
        }

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.parseColor("#EFE7D5"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        web.addJavascriptInterface(new SaveBridge(this), "AndroidStore");
        // Nothing in the game navigates away; keep any stray link inside the app.
        web.setWebViewClient(new WebViewClient());

        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        // The game is a single screen; back leaves the app rather than
        // unwinding a history stack that does not exist.
        moveTaskToBack(true);
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
