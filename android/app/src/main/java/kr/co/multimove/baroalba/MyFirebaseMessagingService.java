package kr.co.multimove.baroalba;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    static final String CHANNEL_ID = "baroalba_channel";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        String title = "바로알바";
        String body  = "";
        String url   = "/바로알바.html";

        if (remoteMessage.getNotification() != null) {
            if (remoteMessage.getNotification().getTitle() != null)
                title = remoteMessage.getNotification().getTitle();
            if (remoteMessage.getNotification().getBody() != null)
                body = remoteMessage.getNotification().getBody();
        }
        if (remoteMessage.getData().containsKey("url"))
            url = remoteMessage.getData().get("url");

        showNotification(title, body, url);
    }

    @Override
    public void onNewToken(String token) {
        // 토큰 갱신 시 SharedPreferences에 저장 → MainActivity.onResume에서 JS로 전달
        getSharedPreferences("baroalba", MODE_PRIVATE)
            .edit().putString("fcm_token", token).apply();
    }

    private void showNotification(String title, String body, String url) {
        createChannel();

        String fullUrl = url.startsWith("http") ? url : "https://baroalba.multimove.co.kr" + url;
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.setData(Uri.parse(fullUrl));

        int flags = PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)          // 상태표시줄: 단색 벡터
                .setLargeIcon(BitmapFactory.decodeResource(        // 알림창: 풀컬러 앱 아이콘
                        getResources(), R.mipmap.ic_launcher))
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pi);

        NotificationManager mgr = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (mgr != null) mgr.notify((int)(System.currentTimeMillis() % 100000), builder.build());
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "바로알바 알림", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("채팅 및 지원 알림");
            NotificationManager mgr = getSystemService(NotificationManager.class);
            if (mgr != null) mgr.createNotificationChannel(ch);
        }
    }
}
