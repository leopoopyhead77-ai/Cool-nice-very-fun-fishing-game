package com.anchor.auth;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * Anchor's only Activity: a WebView showing the bundled authenticator page.
 *
 * The page is served over https://appassets.androidplatform.net/ rather than
 * file:///android_asset/. That hostname is reserved by Google for exactly this
 * and never resolves on the public internet; every request for it is answered
 * here out of the APK's own assets. The point is the origin: a file:// page is
 * not a secure context, so it gets neither getUserMedia (no QR scanning) nor
 * crypto.subtle (no PIN encryption), while an https one gets both. Nothing
 * reaches the network — anything that is not one of our own assets is refused.
 *
 * Every helper class here is static and holds the Activity explicitly. That is
 * not a style preference: d8 8.2.2 crashes turning this JDK's non-static inner
 * classes into dex, so keep them static.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final int CAMERA_REQUEST = 1;
    private static final int FILE_REQUEST = 2;

    private WebView web;
    PermissionRequest pendingCamera;
    ValueCallback<Uri[]> pendingFiles;

    /** The vault, kept in app-private SharedPreferences. */
    public static class VaultBridge {
        private final SharedPreferences prefs;

        VaultBridge(Context ctx) {
            this.prefs = ctx.getSharedPreferences("anchor", Context.MODE_PRIVATE);
        }

        @JavascriptInterface
        public String get(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void set(String key, String value) {
            // commit(), not apply(): an account the user just added must
            // survive the app being swiped away a moment later.
            prefs.edit().putString(key, value).commit();
        }

        @JavascriptInterface
        public void remove(String key) {
            prefs.edit().remove(key).commit();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keeps the codes out of screenshots, screen recordings and the
        // recent-apps thumbnail.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
            WebView.setWebContentsDebuggingEnabled(false);
        }

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.parseColor("#0B1014"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false); // the scanner preview autoplays
        s.setGeolocationEnabled(false);
        s.setSaveFormData(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        web.addJavascriptInterface(new VaultBridge(this), "AndroidStore");
        web.setWebViewClient(new AssetClient(this));
        web.setWebChromeClient(new AppChromeClient(this));

        setContentView(web);
        web.loadUrl(START_URL);
    }

    /** Serves the app out of assets and lets nothing else through. */
    private static class AssetClient extends WebViewClient {
        private final MainActivity host;

        AssetClient(MainActivity host) {
            this.host = host;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!"https".equals(url.getScheme()) || !HOST.equals(url.getHost())) {
                return refuse();
            }
            String path = url.getPath();
            if (path == null || "/".equals(path)) path = "/index.html";
            return host.serveAsset(path.substring(1));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Nothing in the app navigates anywhere; a stray link is dropped
            // rather than handed to a browser.
            return !HOST.equals(request.getUrl().getHost());
        }
    }

    WebResourceResponse serveAsset(String name) {
        try {
            InputStream in = getAssets().open(name);
            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Cache-Control", "no-store");
            // The page is self-contained; this shuts the door on anything the
            // bundle might otherwise be talked into fetching.
            headers.put("Content-Security-Policy",
                    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
                            + "img-src 'self' data: blob:; media-src blob:; connect-src 'none'; "
                            + "form-action 'none'; base-uri 'none'");
            WebResourceResponse res = new WebResourceResponse(mimeOf(name), "utf-8", in);
            res.setResponseHeaders(headers);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                res.setStatusCodeAndReasonPhrase(200, "OK");
            }
            return res;
        } catch (IOException e) {
            return refuse();
        }
    }

    static WebResourceResponse refuse() {
        WebResourceResponse res = new WebResourceResponse(
                "text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            res.setStatusCodeAndReasonPhrase(403, "Blocked");
            res.setResponseHeaders(Collections.<String, String>emptyMap());
        }
        return res;
    }

    static String mimeOf(String name) {
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js")) return "application/javascript";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    /** Camera permission for the scanner, and the picker for the image path. */
    private static class AppChromeClient extends WebChromeClient {
        private final MainActivity host;

        AppChromeClient(MainActivity host) {
            this.host = host;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            boolean wantsCamera = false;
            for (String resource : request.getResources()) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) wantsCamera = true;
            }
            if (!wantsCamera) {
                request.deny();
                return;
            }
            if (host.checkSelfPermission(Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                return;
            }
            host.pendingCamera = request;
            host.requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            host.pendingCamera = null;
        }

        /**
         * Without this a WebView drops <input type="file"> on the floor, which
         * would kill the "decode a screenshot" path — the one that works when
         * the QR code is on the same phone as the app.
         */
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (host.pendingFiles != null) host.pendingFiles.onReceiveValue(null);
            host.pendingFiles = callback;
            try {
                host.startActivityForResult(params.createIntent(), FILE_REQUEST);
            } catch (Exception e) {
                host.pendingFiles = null;
                callback.onReceiveValue(null);
                return false;
            }
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        if (code != CAMERA_REQUEST) {
            super.onRequestPermissionsResult(code, permissions, results);
            return;
        }
        PermissionRequest request = pendingCamera;
        pendingCamera = null;
        if (request == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            // The page turns this into "add the account another way".
            request.deny();
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code != FILE_REQUEST) {
            super.onActivityResult(code, result, data);
            return;
        }
        ValueCallback<Uri[]> callback = pendingFiles;
        pendingFiles = null;
        if (callback == null) return;
        // A null value is how the page learns the picker was dismissed; without
        // it the file input stays wedged and never fires again.
        callback.onReceiveValue(result == Activity.RESULT_OK
                ? WebChromeClient.FileChooserParams.parseResult(result, data)
                : null);
    }

    @Override
    public void onBackPressed() {
        // One screen; back leaves rather than unwinding a history stack that
        // does not exist.
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
