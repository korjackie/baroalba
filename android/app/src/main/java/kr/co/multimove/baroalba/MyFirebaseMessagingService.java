package kr.co.multimove.baroalba;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    static final String CHANNEL_ID      = "baroalba_channel";
    static final String REPLY_INPUT_KEY = "CHAT_REPLY_TEXT";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        String title  = "바로알바";
        String body   = "";
        String url    = "/바로알바.html";
        String appId  = null;
        String type   = null;

        if (remoteMessage.getNotification() != null) {
            if (remoteMessage.getNotification().getTitle() != null)
                title = remoteMessage.getNotification().getTitle();
            if (remoteMessage.getNotification().getBody() != null)
                body = remoteMessage.getNotification().getBody();
        }
        if (remoteMessage.getData().containsKey("url"))
            url = remoteMessage.getData().get("url");
        if (remoteMessage.getData().containsKey("app_id"))
            appId = remoteMessage.getData().get("app_id");
        if (remoteMessage.getData().containsKey("type"))
            type = remoteMessage.getData().get("type");

        showNotification(title, body, url, appId, type);
    }

    @Override
    public void onNewToken(String token) {
        getSharedPreferences("baroalba", MODE_PRIVATE)
            .edit().putString("fcm_token", token).apply();
    }

    private void showNotification(String title, String body, String url, String appId, String type) {
        createChannel();

        int notifId = (int)(System.currentTimeMillis() % 100000);

        String fullUrl = url.startsWith("http") ? url : "https://baroalba.multimove.co.kr" + url;
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.setData(Uri.parse(fullUrl));

        int flags = PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, notifId, intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setLargeIcon(BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher))
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pi);

        // 채팅 알림에만 인라인 답장 버튼 추가
        if ("chat".equals(type) && appId != null) {
            RemoteInput remoteInput = new RemoteInput.Builder(REPLY_INPUT_KEY)
                    .setLabel("답장 입력...")
                    .build();

            Intent replyIntent = new Intent(this, ChatReplyReceiver.class);
            replyIntent.putExtra("app_id", appId);
            replyIntent.putExtra("notif_id", notifId);
            replyIntent.putExtra("sender_title", title);

            int replyFlags = PendingIntent.FLAG_UPDATE_CURRENT |
                    (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
                    this, notifId, replyIntent, replyFlags);

            NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                    R.drawable.ic_notification, "답장", replyPendingIntent)
                    .addRemoteInput(remoteInput)
                    .setAllowGeneratedReplies(true)
                    .build();

            builder.addAction(replyAction);
        }

        NotificationManager mgr = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (mgr != null) mgr.notify(notifId, builder.build());
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
