package kr.co.multimove.baroalba;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
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
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends AppCompatActivity {

    private static final String START_URL = "https://baroalba.multimove.co.kr/login.html";
    private static final int REQ_FILE   = 1;
    private static final int REQ_PERM   = 2;
    private static final int REQ_CAMERA = 3;

    private BaroAlbaWebView webView;
    private ValueCallback<Uri[]> fileCb;
    private boolean captureMode = false;
    private Uri pendingPhotoUri = null;
    private int safeTop = 0, safeBottom = 0;
    private boolean safeAreaReceived = false; // 실측 WindowInsets 콜백을 한 번이라도 받았는지
    private String latestFCMToken = null; // 페이지 로드 전 수신된 토큰 보관

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Android 12+ 자동 스플래시 즉시 dismiss — 웹 스플래시(login.html)가 담당
        SplashScreen.installSplashScreen(this).setKeepOnScreenCondition(() -> false);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);

        webView = (BaroAlbaWebView) findViewById(R.id.webview);
        webView.setBackgroundColor(Color.parseColor("#C8102E")); // 로딩 중 흰색 플래시 방지

        // 시스템바 + IME(키보드) 높이를 읽어 CSS 변수로 주입
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            safeTop    = bars.top;
            safeBottom = bars.bottom;
            safeAreaReceived = true;
            applySafeArea();

            boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            Insets imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime());
            int imeHeight = imeVisible ? Math.max(0, imeInsets.bottom - bars.bottom) : 0;
            applyKbHeight(imeHeight);

            return WindowInsetsCompat.CONSUMED;
        });
        // 리스너 등록 직후 능동적으로 한 번 더 요청 - 시스템이 자연스럽게 첫 콜백을
        // 늦게 보내는 기기에서 safeAreaReceived==true가 되는 시점을 앞당김
        ViewCompat.requestApplyInsets(webView);

        // 카카오/네이버/구글 로그인은 우리 도메인 → Supabase auth 도메인 → 각 OAuth
        // 제공자 도메인을 오가는 여러 단계 리다이렉트인데, 안드로이드 WebView는 기본적으로
        // "제3자 쿠키"(현재 페이지 도메인과 다른 도메인이 심는 쿠키)를 차단한다. 이걸 켜주지
        // 않으면 카카오 로그인 세션 쿠키가 유지되지 않아, 이미 카카오에 로그인돼있어도 매번
        // 새로 이메일/비번을 입력해야 하는 것처럼 보인다(2026-07-17 피드백으로 발견) - 명시적으로 허용
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

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
        s.setCacheMode(WebSettings.LOAD_NO_CACHE); // 항상 네트워크에서 최신 HTML 로드
        webView.clearCache(true); // 이전 HTTP 캐시 제거
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
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                // 카카오/네이버/구글 로그인 페이지는 같은 WebView 안에서 그대로 로드되는데,
                // WebView 배경색이 항상 브랜드 레드로 고정돼 있어서 그 페이지의 여백에
                // 빨간 배경이 그대로 비쳐 보이는 문제가 있었음(로그인 자체는 정상 동작).
                // 우리 도메인이 아닐 때만 흰색으로 바꿔주고, 우리 도메인으로 돌아오면 다시 레드로.
                if (url != null && url.startsWith("https://baroalba.multimove.co.kr")) {
                    view.setBackgroundColor(Color.parseColor("#C8102E"));
                } else {
                    view.setBackgroundColor(Color.WHITE);
                }
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
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
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

    // 상태표시줄이 헤더에 바로 붙어보이던 문제(마이페이지 여러 서브패널, 2026-07-16)의
    // 의심되는 근본 원인: onPageFinished가 WindowInsets 콜백보다 먼저 발생하면
    // safeTop/safeBottom이 아직 0,0(필드 기본값)인 채로 --sat/--sab에 그대로 찍혀버려서,
    // 웹 쪽 JS 폴백(28px)까지 나중에 덮어써버릴 수 있었음. 실측 콜백을 한 번도 못 받은
    // 상태면 0을 찍지 않고 그냥 넘어가서(웹 쪽 자체 폴백이 유지되게) 방지한다.
    // ※ 이 파일은 Java라 이 수정 자체는 APK를 다시 빌드해야 반영됨 - 웹 쪽
    // (.mpsub-hdr의 max(...,34px) 최소 여백)은 이 콜백 타이밍과 무관하게 항상 보장됨
    private void applySafeArea() {
        if (webView == null || !safeAreaReceived) return;
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

    @Override
    protected void onPause() {
        super.onPause();
        // 카카오 로그인 세션 쿠키를 디스크에 실제로 기록 - 이걸 안 하면 앱을 껐다 켤 때
        // 메모리상 쿠키가 날아가 로그인 세션이 유지되지 않을 수 있음(2026-07-17 추가)
        CookieManager.getInstance().flush();
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
            // EXTRA_SUBJECT를 같이 넣으면 카카오톡 등 일부 공유 대상이
            // "제목 - 본문"처럼 이어붙여서 표시하는데, text 안에 이미 제목이
            // 첫 줄로 들어있어 내용이 중복으로 두 번 보이는 문제가 있었음.
            // text/plain 공유는 제목이 필수가 아니므로 EXTRA_SUBJECT는 생략.
            String content = text + "\n" + url;
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("text/plain");
            shareIntent.putExtra(Intent.EXTRA_TEXT, content);
            startActivity(Intent.createChooser(shareIntent, "공유하기"));
        }

        // 채팅 키보드 강제 유지 (SHOW_FORCED: hideKeyboard 전까지 절대 닫히지 않음)
        @JavascriptInterface
        public void showKeyboard() {
            runOnUiThread(() -> {
                webView.requestFocus();
                InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(webView, InputMethodManager.SHOW_FORCED);
            });
        }

        // 채팅 오버레이 닫을 때 강제 상태 해제
        @JavascriptInterface
        public void hideKeyboard() {
            runOnUiThread(() -> {
                webView.scrollKbGuard = false;
                InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null) imm.hideSoftInputFromWindow(webView.getWindowToken(), 0);
            });
        }

        // 메시지 전송 직후 guard ON → 스크롤로 인한 IME 닫힘 즉시 복구
        // JS에서 전송 시 true, Realtime 콜백 수신 후 false
        @JavascriptInterface
        public void setScrollKbGuard(boolean on) {
            webView.scrollKbGuard = on;
            if (on) {
                // 1.5초 안전장치: JS가 false를 안 보내도 자동 해제
                webView.postDelayed(() -> webView.scrollKbGuard = false, 1500);
            }
        }

        // Supabase 인증 토큰 저장 → 인라인 알림 답장 시 사용
        @JavascriptInterface
        public void saveAuthToken(String token) {
            if (token == null || token.isEmpty()) return;
            getSharedPreferences("baroalba", MODE_PRIVATE)
                .edit().putString("supabase_token", token).apply();
        }

        // PDF(계약서/지원서) 다운로드용 - WebView는 JS의 blob: URL 다운로드(html2pdf의
        // save())를 받아줄 장치가 기본적으로 없어서(setDownloadListener는 실제 URL 네비게이션만
        // 잡고 프로그래매틱 blob 앵커 클릭은 못 잡음) 계속 "다운로드 안 됨" 상태였음
        // (2026-07-19 피드백). JS에서 PDF를 base64로 만들어 이 브릿지로 직접 넘기고,
        // 네이티브에서 MediaStore(API 29+)/앱 전용 폴더(API<29)에 파일로 씀.
        @JavascriptInterface
        public void saveBase64File(String base64Data, String filename, String mimeType) {
            runOnUiThread(() -> {
                try {
                    byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentValues cv = new ContentValues();
                        cv.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                        cv.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                        cv.put(MediaStore.Downloads.IS_PENDING, 1);
                        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (uri == null) throw new Exception("MediaStore insert 실패");
                        try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                            os.write(bytes);
                        }
                        cv.clear();
                        cv.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(uri, cv, null, null);
                    } else {
                        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                        if (dir != null && !dir.exists()) dir.mkdirs();
                        File out = new File(dir, filename);
                        try (FileOutputStream fos = new FileOutputStream(out)) {
                            fos.write(bytes);
                        }
                    }
                    Toast.makeText(MainActivity.this, "다운로드 폴더에 저장했어요: " + filename, Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "파일 저장에 실패했어요", Toast.LENGTH_LONG).show();
                }
            });
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
