package com.rhhabits.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class RHTrackingService extends Service {
    public static final String ACTION_START = "RH_START";
    public static final String ACTION_STOP = "RH_STOP";
    private static final String CHANNEL_ID = "rh_tracking";
    private static final int NOTIFICATION_ID = 4721;
    private static final String PREFS = "rh_tracking";

    private FusedLocationProviderClient fused;
    private LocationCallback callback;
    private ScheduledExecutorService scheduler;
    private String tripId = "";
    private String endpoint = "https://rhhabits.vercel.app/api/native-location";
    private volatile boolean stopping = false;
    private boolean updatesRequested = false;

    @Override public void onCreate() {
        super.onCreate();
        fused = LocationServices.getFusedLocationProviderClient(this);
        scheduler = Executors.newSingleThreadScheduledExecutor();
        createChannel();
        callback = new LocationCallback() {
            @Override public void onLocationResult(LocationResult result) {
                if (result == null) return;
                for (Location location : result.getLocations()) saveLocation(location);
            }
        };
    }

    @Override public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String action = intent == null ? "" : intent.getAction();

        if (ACTION_STOP.equals(action)) {
            stopping = true;
            requestStopAndFlush();
            return START_NOT_STICKY;
        }

        if (ACTION_START.equals(action)) {
            String id = intent.getStringExtra("tripId");
            String ep = intent.getStringExtra("endpoint");
            if (id != null && !id.trim().isEmpty()) tripId = id.trim();
            if (ep != null && !ep.trim().isEmpty()) endpoint = ep.trim();
            prefs.edit().putBoolean("running", true).putString("tripId", tripId)
                    .putString("endpoint", endpoint).putLong("startTime", System.currentTimeMillis()).apply();
        } else if (prefs.getBoolean("running", false)) {
            tripId = prefs.getString("tripId", "");
            endpoint = prefs.getString("endpoint", endpoint);
        } else {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (tripId.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            startForegroundCompat();
            if (!updatesRequested) requestLocationUpdates();
        } catch (Exception e) {
            prefs.edit().putBoolean("running", false).apply();
            stopSelf();
        }
        return START_STICKY;
    }

    private void requestLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("ACCESS_FINE_LOCATION not granted");
        }

        LocationRequest request = new LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY, 1000L)
                .setMinUpdateIntervalMillis(500L)
                .setMaxUpdateDelayMillis(3000L)
                .setMinUpdateDistanceMeters(3f)
                .setWaitForAccurateLocation(false)
                .build();

        fused.requestLocationUpdates(request, callback, Looper.getMainLooper());
        updatesRequested = true;
        scheduler.scheduleAtFixedRate(() -> {
            try {
                RHTrackingUploader.syncAll(getApplicationContext(), endpoint, 8000);
            } catch (Exception ignored) {}
        }, 5, 10, TimeUnit.SECONDS);
    }

    private void saveLocation(Location l) {
        if (l == null || tripId.isEmpty()) return;
        long t = l.getTime() > 0 ? l.getTime() : System.currentTimeMillis();
        double accuracy = l.hasAccuracy() ? l.getAccuracy() : 0;
        if (accuracy > 150) return;
        double speedKmh = l.hasSpeed() ? Math.max(0, l.getSpeed() * 3.6) : 0;
        Double bearing = l.hasBearing() ? (double) l.getBearing() : null;
        Double altitude = l.hasAltitude() ? l.getAltitude() : null;

        TrackingDb.get(this).insert(tripId, t, l.getLatitude(), l.getLongitude(),
                accuracy, speedKmh, bearing, altitude);

        Intent i = new Intent(RHTrackingPlugin.ACTION_LOCATION);
        i.setPackage(getPackageName());
        i.putExtra("tripId", tripId);
        i.putExtra("latitude", l.getLatitude());
        i.putExtra("longitude", l.getLongitude());
        i.putExtra("accuracy", accuracy);
        i.putExtra("speedKmh", speedKmh);
        i.putExtra("time", t);
        if (bearing != null) i.putExtra("bearing", bearing);
        if (altitude != null) i.putExtra("altitude", altitude);
        sendBroadcast(i);
    }

    private void requestStopAndFlush() {
        new Thread(() -> {
            long deadline = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < deadline) {
                try {
                    RHTrackingUploader.syncAll(getApplicationContext(), endpoint, 6000);
                    if (TrackingDb.get(this).pendingCount(tripId) == 0) break;
                } catch (Exception ignored) {}
                try { Thread.sleep(600); } catch (InterruptedException ignored) { break; }
            }
            try { fused.removeLocationUpdates(callback); } catch (Exception ignored) {}
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("running", false).apply();
            stopSelf();
        }, "rh-gps-stop").start();
    }

    private void startForegroundCompat() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pending = launch == null ? null : PendingIntent.getActivity(
                this, 4722, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("RH Habits • GPS aktif")
                .setContentText("RH Habits sedang merekam perjalanan")
.setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pending)
                .build();

        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel c = new NotificationChannel(
                CHANNEL_ID, "RH Habits GPS Tracking", NotificationManager.IMPORTANCE_LOW);
        c.setDescription("Notifikasi permanen saat RH Habits merekam perjalanan.");
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.createNotificationChannel(c);
    }

    @Override public void onDestroy() {
        try { fused.removeLocationUpdates(callback); } catch (Exception ignored) {}
        try { scheduler.shutdownNow(); } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }
}
