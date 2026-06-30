package kr.co.multimove.baroalba;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class ChatReplyReceiver extends BroadcastReceiver {

    private static final String SUPABASE_URL  = "https://onwvbmllpycgswfzywjv.supabase.co";
    private static final String SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ud3ZibWxscHljZ3N3Znp5d2p2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDMyNzksImV4cCI6MjA5NTc3OTI3OX0.CbwhyfqCZp_jjMbHUESVzbPDAZLNV2lpniUkouqLLmQ";

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        if (results == null) return;

        CharSequence replyText = results.getCharSequence(MyFirebaseMessagingService.REPLY_INPUT_KEY);
        if (replyText == null || replyText.length() == 0) return;

        String appId       = intent.getStringExtra("app_id");
        int    notifId     = intent.getIntExtra("notif_id", 0);
        String senderTitle = intent.getStringExtra("sender_title");
        String authToken   = context.getSharedPreferences("baroalba", Context.MODE_PRIVATE)
                                    .getString("supabase_token", null);

        if (appId == null || authToken == null) return;

        final String msgContent = replyText.toString().trim();
        if (msgContent.isEmpty()) return;

        // 전송 중 표시: 알림 업데이트
        showSendingNotif(context, notifId, senderTitle, msgContent);

        // 백그라운드 스레드에서 Supabase REST API 호출
        new Thread(() -> {
            boolean success = insertMessage(appId, msgContent, authToken);
            showResultNotif(context, notifId, senderTitle, msgContent, success);
        }).start();
    }

    private boolean insertMessage(String appId, String content, String authToken) {
        try {
            URL url = new URL(SUPABASE_URL + "/rest/v1/messages");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", SUPABASE_ANON);
            conn.setRequestProperty("Authorization", "Bearer " + authToken);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);

            String safeContent = content.replace("\\", "\\\\").replace("\"", "\\\"");
            // messages 테이블: chat_id (FK), sender_role ('worker'|'business'), content
            String body = "{\"chat_id\":\"" + appId + "\",\"content\":\"" + safeContent + "\",\"sender_role\":\"worker\"}";

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        }
    }

    // JWT payload(base64url) 디코딩 → sub 클레임 = Supabase user UUID
    private String extractUserIdFromJwt(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length < 2) return null;
            String payload = parts[1];
            // base64url → base64 변환 후 디코딩
            int pad = (4 - payload.length() % 4) % 4;
            StringBuilder sb = new StringBuilder(payload.replace('-', '+').replace('_', '/'));
            for (int i = 0; i < pad; i++) sb.append('=');
            byte[] decoded = android.util.Base64.decode(sb.toString(), android.util.Base64.DEFAULT);
            String json = new String(decoded, StandardCharsets.UTF_8);
            int idx = json.indexOf("\"sub\":\"");
            if (idx < 0) return null;
            int start = idx + 7;
            int end = json.indexOf('"', start);
            return end > start ? json.substring(start, end) : null;
        } catch (Exception e) {
            return null;
        }
    }

    private void showSendingNotif(Context ctx, int notifId, String title, String msg) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, MyFirebaseMessagingService.CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title != null ? title : "바로알바")
                .setContentText("전송 중: " + msg)
                .setProgress(0, 0, true)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        notify(ctx, notifId, b);
    }

    private void showResultNotif(Context ctx, int notifId, String title, String msg, boolean ok) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, MyFirebaseMessagingService.CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(ok ? "답장 전송됨" : "전송 실패")
                .setContentText(ok ? msg : "다시 시도해주세요")
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        notify(ctx, notifId, b);
    }

    private void notify(Context ctx, int id, NotificationCompat.Builder b) {
        NotificationManager mgr = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (mgr != null) mgr.notify(id, b.build());
    }
}
