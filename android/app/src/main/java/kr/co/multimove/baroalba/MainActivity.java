package kr.co.multimove.baroalba;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private static final String START_URL = "https://baroalba.multimove.co.kr/login.html";
    private static final int REQ_FILE = 1;
    private static final int REQ_PERM  = 2;

    private WebView webView;
    private ValueCallback<Uri[]> fileCb;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(true);
        s.setGeolocationEnabled(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        // 바로알바 앱 식별자 추가 — isInAppBrowser() 오인식 방지
        s.setUserAgentString(s.getUserAgentString() + " BaroAlbaApp/1.0");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                // 앱 도메인 — WebView에서 직접 처리
                if (url.startsWith("https://baroalba.multimove.co.kr")) return false;
                // OAuth/외부 URL — 시스템 브라우저/앱으로 열기
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
                    return true;
                }
                // 카카오/네이버 딥링크 스킴
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // 파일 선택 (프로필 사진 업로드 등)
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (fileCb != null) { fileCb.onReceiveValue(null); fileCb = null; }
                fileCb = cb;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }

            // 위치 권한
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                                                           GeolocationPermissions.Callback cb) {
                if (ContextCompat.checkSelfPermission(MainActivity.this,
                        Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(MainActivity.this,
                            new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                                         Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_PERM);
                }
                cb.invoke(origin, true, false);
            }

            // 카메라 등 미디어 권한
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }
        });

        // 딥링크로 앱이 열린 경우 (비밀번호 재설정, OAuth 콜백)
        webView.loadUrl(resolveUrl(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // 앱 실행 중 딥링크 수신 (비밀번호 재설정 이메일 링크 등)
        webView.loadUrl(resolveUrl(intent));
    }

    private String resolveUrl(Intent intent) {
        if (intent != null && intent.getData() != null) {
            String url = intent.getData().toString();
            if (url.startsWith("https://baroalba.multimove.co.kr")) return url;
        }
        return START_URL;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_FILE) {
            Uri[] results = null;
            if (res == Activity.RESULT_OK && data != null) {
                String str = data.getDataString();
                if (str != null) results = new Uri[]{Uri.parse(str)};
            }
            if (fileCb != null) { fileCb.onReceiveValue(results); fileCb = null; }
        }
    }
}
