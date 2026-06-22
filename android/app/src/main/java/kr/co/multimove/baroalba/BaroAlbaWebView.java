package kr.co.multimove.baroalba;

import android.content.Context;
import android.util.AttributeSet;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;

public class BaroAlbaWebView extends WebView {

    // JS가 setScrollKbGuard(true) 하면 true, 스크롤 완료 후 false
    public volatile boolean scrollKbGuard = false;

    public BaroAlbaWebView(Context context) { super(context); }
    public BaroAlbaWebView(Context context, AttributeSet attrs) { super(context, attrs); }
    public BaroAlbaWebView(Context context, AttributeSet attrs, int defStyle) { super(context, attrs, defStyle); }

    @Override
    protected void onScrollChanged(int l, int t, int oldl, int oldt) {
        super.onScrollChanged(l, t, oldl, oldt);
        // 채팅 메시지 전송 직후 guard가 켜져 있으면 스크롤로 인한 IME 닫힘을 즉시 복구
        if (scrollKbGuard) {
            InputMethodManager imm = (InputMethodManager)
                    getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(this, InputMethodManager.SHOW_FORCED);
        }
    }
}
