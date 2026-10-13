package com.rhhabits.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.PluginMethod;

import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "RHTracking", permissions = {
        @Permission(alias = "location", strings = {Manifest.permission.ACCESS_FINE_LOCATION}),
        @Permission(alias = "coarseLocation", strings = {Manifest.permission.ACCESS_COARSE_LOCATION}),
        @Permission(alias = "backgroundLocation", strings = {Manifest.permission.ACCESS_BACKGROUND_LOCATION}),
        @Permission(alias = "notification", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class RHTrackingPlugin extends Plugin {
    public static final String ACTION_LOCATION = "com.rhhabits.app.RH_LOCATION";
    private static final String PREFS = "rh_tracking";
    private static final String KEY_ENDPOINT = "endpoint";

    private BroadcastReceiver locationReceiver;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();
        locationReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (!ACTION_LOCATION.equals(intent.getAction())) return;
                JSObject out = new JSObject();
                out.put("tripId", intent.getStringExtra("tripId"));
                out.put("latitude", intent.getDoubleExtra("latitude", Double.NaN));
                out.put("longitude", intent.getDoubleExtra("longitude", Double.NaN));
                out.put("accuracy", intent.getDoubleExtra("accuracy", 0));
                out.put("speedKmh", intent.getDoubleExtra("speedKmh", 0));
                out.put("bearing", intent.hasExtra("bearing") ? intent.getDoubleExtra("bearing", 0) : null);
                out.put("altitude", intent.hasExtra("altitude") ? intent.getDoubleExtra("altitude", 0) : null);
                out.put("time", intent.getLongExtra("time", System.currentTimeMillis()));
                out.put("source", "native-android");
                notifyListeners("location", out);
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_LOCATION);
        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(locationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(locationReceiver, filter);
        }
    }

    @PluginMethod
    public void getPermissionStatus(PluginCall call) {
        Context context = getContext();
        boolean fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean background = Build.VERSION.SDK_INT < 29 || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean notifications = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;

        JSObject out = new JSObject();
        out.put("location", fine ? "granted" : "denied");
        out.put("preciseLocation", fine);
        out.put("coarseLocation", coarse);
        out.put("backgroundLocation", background ? "granted" : "denied");
        out.put("notification", notifications ? "granted" : "denied");
        out.put("locationEnabled", isLocationEnabled(context));
        out.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(out);
    }

    private boolean isLocationEnabled(Context context) {
        try {
            LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            if (manager == null) return false;
            if (Build.VERSION.SDK_INT >= 28) return manager.isLocationEnabled();
            return manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {
            return false;
        }
    }

    private void launchAppSettings(PluginCall call, boolean locationSource) {
        try {
            Intent intent;
            if (locationSource) {
                intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Pengaturan Android tidak bisa dibuka.", e);
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        launchAppSettings(call, false);
    }

    @PluginMethod
    public void openBackgroundLocationSettings(PluginCall call) {
        // Android 11+ requires the user to enable "Allow all the time" from App info > Permissions > Location.
        launchAppSettings(call, false);
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        launchAppSettings(call, true);
    }

    @PluginMethod
    public void start(PluginCall call) {
        final String tripId = call.getString("tripId", "").trim();
        final String endpoint = call.getString("endpoint", "https://rhhabits.vercel.app/api/native-location").trim();
        if (tripId.isEmpty()) {
            call.reject("TripID wajib diisi.");
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Izin lokasi presisi belum diberikan. Pilih lokasi Akurat di Pengaturan Android.");
            return;
        }
        if (Build.VERSION.SDK_INT >= 29 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Izin lokasi sepanjang waktu belum aktif. Pilih Lokasi > Izinkan sepanjang waktu di Pengaturan Android.");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Izin notifikasi belum aktif. Izinkan notifikasi RH Habits agar status GPS tetap terlihat.");
            return;
        }
        if (!isLocationEnabled(getContext())) {
            call.reject("Layanan lokasi HP belum aktif. Aktifkan GPS/Lokasi dari Quick Settings Android.");
            return;
        }

        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_ENDPOINT, endpoint)
                .apply();

        Intent intent = new Intent(getContext(), RHTrackingService.class);
        intent.setAction(RHTrackingService.ACTION_START);
        intent.putExtra("tripId", tripId);
        intent.putExtra("endpoint", endpoint);
        if (Build.VERSION.SDK_INT >= 26) {
            ContextCompat.startForegroundService(getContext(), intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), RHTrackingService.class);
        intent.setAction(RHTrackingService.ACTION_STOP);
        // STOP is not a foreground-service start: starting it with
        // startForegroundService() would require this STOP path to promote itself
        // within the system timeout. The action is issued from the visible app UI.
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void getPoints(PluginCall call) {
        final String tripId = call.getString("tripId", "").trim();
        if (tripId.isEmpty()) {
            call.resolve(new JSObject().put("points", new JSArray()).put("count", 0));
            return;
        }
        executor.execute(() -> {
            List<TrackingDb.Point> points = TrackingDb.get(getContext()).getPoints(tripId);
            JSArray arr = new JSArray();
            for (TrackingDb.Point p : points) arr.put(p.toJson());
            JSObject out = new JSObject();
            out.put("points", arr);
            out.put("count", points.size());
            call.resolve(out);
        });
    }

    @PluginMethod
    public void sync(PluginCall call) {
        final String endpoint = call.getString("endpoint",
                getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .getString(KEY_ENDPOINT, "https://rhhabits.vercel.app/api/native-location"));
        executor.execute(() -> {
            try {
                RHTrackingUploader.SyncResult result = RHTrackingUploader.syncAll(
                        getContext().getApplicationContext(), endpoint, 15000
                );
                JSArray ids = new JSArray();
                for (String id : result.tripIds) ids.put(id);
                JSObject out = new JSObject();
                out.put("ok", true);
                out.put("tripIds", ids);
                out.put("remaining", result.remaining);
                call.resolve(out);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "GPS sync gagal." : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void clearTrip(PluginCall call) {
        final String tripId = call.getString("tripId", "").trim();
        executor.execute(() -> {
            TrackingDb.get(getContext()).deleteTrip(tripId);
            call.resolve();
        });
    }

    @PluginMethod
    public void getActiveSession(PluginCall call) {
        android.content.SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject out = new JSObject();
        out.put("running", p.getBoolean("running", false));
        out.put("tripId", p.getString("tripId", ""));
        out.put("startTime", p.getLong("startTime", 0));
        call.resolve(out);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        android.content.SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        final String tripId = p.getString("tripId", "");
        executor.execute(() -> {
            JSObject out = new JSObject();
            out.put("running", p.getBoolean("running", false));
            out.put("tripId", tripId);
            out.put("pending", TrackingDb.get(getContext()).pendingCount(tripId));
            call.resolve(out);
        });
    }

    @Override
    protected void handleOnDestroy() {
        try { if (locationReceiver != null) getContext().unregisterReceiver(locationReceiver); } catch (Exception ignored) {}
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
