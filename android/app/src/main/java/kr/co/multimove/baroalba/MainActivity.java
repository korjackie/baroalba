package kr.co.multimove.baroalba;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.GeolocationPermissions;
import androidx.core.content.FileProvider;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.File;
import android.webkit.JavascriptInterface;
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
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends AppCompatActivity {

    private static final String START_URL = "https://baroalba.multimove.co.kr/login.html";
    private static final int REQ_FILE   = 1;
    private static final int REQ_PERM   = 2;
    private static final int REQ_CAMERA = 3;

    private WebView webView;
    private ValueCallback<Uri[]> fileCb;
    private boolean captureMode = false;
    private Uri pendingPhotoUri = null;
    private int safeTop = 0, safeBottom = 0;
    private String latestFCMToken = null; // 페이지 로드 전 수신된 토큰 보관

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);

        // 시스템바 + IME(키보드) 높이를 읽어 CSS 변수로 주입
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            safeTop    = bars.top;
            safeBottom = bars.bottom;
            applySafeArea();

            boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            Insets imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime());
            int imeHeight = imeVisible ? Math.max(0, imeInsets.bottom - bars.bottom) : 0;
            applyKbHeight(imeHeight);

            return WindowInsetsCompat.CONSUMED;
        });

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

        // ; wv) 제거 → 구글 OAuth 차단 방지 / BaroAlbaApp 식별자 추가
        String ua = s.getUserAgentString().replace("; wv)", ")");
        s.setUserAgentString(ua + " BaroAlbaApp/1.0");

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (url.startsWith("https://baroalba.multimove.co.kr")) return false;
                if (url.contains(".supabase.co")) return false;
                if (url.contains(".google.com")) return false;
                if (url.contains("naver.com")) return false;
                // intent: 스킴은 kakao.com 체크보다 먼저 처리
                // (Kakao SDK가 생성하는 intent:kakaolink://...에 sharer.kakao.com이 포함되어
                //  kakao.com 조건에 걸려 WebView가 직접 로드 시도 → ERR_UNKNOWN_URL_SCHEME 발생)
                if (url.startsWith("intent:")) {
                    try {
                        Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                        startActivity(intent);
                    } catch (Exception ignored) {}
                    return true;
                }
                if (url.startsWith("kakaolink://") || url.startsWith("kakao://")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
                    return true;
                }
                if (url.contains("kakao.com")) return false;
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
                    return true;
                }
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                applySafeArea();
                // 페이지 로드 완료 후 FCM 토큰 재전달 (타이밍 문제 보완)
                if (latestFCMToken != null) {
                    String js = "if(window._onFCMToken)window._onFCMToken('" + latestFCMToken + "');";
                    view.evaluateJavascript(js, null);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (fileCb != null) { fileCb.onReceiveValue(null); fileCb = null; }
                fileCb = cb;
                captureMode = params.isCaptureEnabled();
                if (captureMode) {
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                            != PackageManager.PERMISSION_GRANTED) {
                        ActivityCompat.requestPermissions(MainActivity.this,
                                new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                        return true;
                    }
                }
                return launchFileOrCamera();
            }

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

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }
        });

        // POST_NOTIFICATIONS 런타임 권한 (Android 13+)
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_PERM);
            }
        }

        // FCM 토큰 취득 → 보관 후 JS로 전달 (페이지 로드 전이면 onPageFinished에서 재시도)
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                latestFCMToken = task.getResult();
                String js = "if(window._onFCMToken)window._onFCMToken('" + latestFCMToken + "');";
                webView.post(() -> webView.evaluateJavascript(js, null));
            }
        });
        // SharedPreferences에 저장된 갱신 토큰도 처리
        String savedToken = getSharedPreferences("baroalba", MODE_PRIVATE).getString("fcm_token", null);
        if (savedToken != null) latestFCMToken = savedToken;

        webView.loadUrl(resolveUrl(getIntent()));
    }

    private boolean launchFileOrCamera() {
        try {
            Intent intent;
            if (captureMode) {
                // 외부 파일 디렉토리 사용 (더 높은 호환성)
                java.io.File dir = getExternalFilesDir(android.os.Environment.DIRECTORY_PICTURES);
                if (dir == null) dir = getCacheDir();
                java.io.File photoFile = java.io.File.createTempFile("photo_", ".jpg", dir);
                pendingPhotoUri = FileProvider.getUriForFile(
                    this, "kr.co.multimove.baroalba.fileprovider", photoFile);
                intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                intent.putExtra(MediaStore.EXTRA_OUTPUT, pendingPhotoUri);
                intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType("image/*");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
            }
            startActivityForResult(intent, REQ_FILE);
            return true;
        } catch (Exception e) {
            if (fileCb != null) { fileCb.onReceiveValue(null); fileCb = null; }
            return false;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                launchFileOrCamera();
            } else {
                if (fileCb != null) { fileCb.onReceiveValue(null); fileCb = null; }
            }
        }
    }

    private void applySafeArea() {
        if (webView == null) return;
        float density = getResources().getDisplayMetrics().density;
        int topDp  = Math.round(safeTop  / density);
        int botDp  = Math.round(safeBottom / density);
        String js = "document.documentElement.style.setProperty('--sat','" + topDp + "px');" +
                    "document.documentElement.style.setProperty('--sab','" + botDp + "px');";
        webView.evaluateJavascript(js, null);
    }

    private void applyKbHeight(int pxHeight) {
        if (webView == null) return;
        float density = getResources().getDisplayMetrics().density;
        final int dp = Math.round(pxHeight / density);
        webView.post(() -> webView.evaluateJavascript(
            "if(window._onNativeKbChange)window._onNativeKbChange(" + dp + ");", null));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        webView.loadUrl(resolveUrl(intent));
    }

    private String resolveUrl(Intent intent) {
        if (intent != null && intent.getData() != null) {
            String url = intent.getData().toString();
            if (url.startsWith("https://baroalba.multimove.co.kr")) return url;
        }
        return START_URL;
    }

    private class AndroidBridge {
        @JavascriptInterface
        public void share(String title, String text, String url) {
            String content = text + "\n" + url;
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("text/plain");
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            shareIntent.putExtra(Intent.EXTRA_TEXT, content);
            startActivity(Intent.createChooser(shareIntent, "공유하기"));
        }
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
            if (res == Activity.RESULT_OK) {
                if (captureMode && pendingPhotoUri != null) {
                    results = new Uri[]{pendingPhotoUri};
                } else if (data != null && data.getClipData() != null) {
                    android.content.ClipData clip = data.getClipData();
                    results = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        results[i] = clip.getItemAt(i).getUri();
                    }
                } else if (data != null && data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            captureMode = false;
            pendingPhotoUri = null;
            if (fileCb != null) { fileCb.onReceiveValue(results); fileCb = null; }
        }
    }
}
