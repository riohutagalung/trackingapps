package com.rhhabits.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class TrackingDb extends SQLiteOpenHelper {
    private static final String DB_NAME = "rh_tracking.db";
    private static final int DB_VERSION = 1;
    private static volatile TrackingDb instance;

    public static TrackingDb get(Context context) {
        if (instance == null) {
            synchronized (TrackingDb.class) {
                if (instance == null) instance = new TrackingDb(context.getApplicationContext());
            }
        }
        return instance;
    }

    private TrackingDb(Context c) { super(c, DB_NAME, null, DB_VERSION); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE points (" +
                "_id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "trip_id TEXT NOT NULL," +
                "time_ms INTEGER NOT NULL," +
                "lat REAL NOT NULL," +
                "lng REAL NOT NULL," +
                "accuracy REAL NOT NULL DEFAULT 0," +
                "speed_kmh REAL NOT NULL DEFAULT 0," +
                "bearing REAL," +
                "altitude REAL," +
                "uploaded INTEGER NOT NULL DEFAULT 0," +
                "UNIQUE(trip_id,time_ms,lat,lng) ON CONFLICT IGNORE)");
        db.execSQL("CREATE INDEX idx_points_trip_time ON points(trip_id,time_ms)");
        db.execSQL("CREATE INDEX idx_points_uploaded ON points(uploaded,trip_id)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    public synchronized long insert(String tripId, long timeMs, double lat, double lng,
                                     double accuracy, double speedKmh, Double bearing,
                                     Double altitude) {
        ContentValues v = new ContentValues();
        v.put("trip_id", tripId);
        v.put("time_ms", timeMs);
        v.put("lat", lat);
        v.put("lng", lng);
        v.put("accuracy", accuracy);
        v.put("speed_kmh", speedKmh);
        if (bearing != null) v.put("bearing", bearing);
        if (altitude != null) v.put("altitude", altitude);
        return getWritableDatabase().insert("points", null, v);
    }

    public synchronized List<Point> getPending(String tripId, int limit) {
        ArrayList<Point> out = new ArrayList<>();
        String sel = "uploaded=0" + (tripId == null || tripId.isEmpty() ? "" : " AND trip_id=?");
        String[] args = tripId == null || tripId.isEmpty() ? null : new String[]{tripId};
        try (Cursor c = getReadableDatabase().query("points", null, sel, args, null, null, "time_ms ASC", String.valueOf(limit))) {
            while (c.moveToNext()) out.add(pointFromCursor(c));
        }
        return out;
    }

    public synchronized List<Point> getPoints(String tripId) {
        ArrayList<Point> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query("points", null, "trip_id=?",
                new String[]{tripId}, null, null, "time_ms ASC")) {
            while (c.moveToNext()) out.add(pointFromCursor(c));
        }
        return out;
    }

    public synchronized Set<String> getPendingTripIds() {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        try (Cursor c = getReadableDatabase().query(true, "points", new String[]{"trip_id"},
                "uploaded=0", null, null, null, "trip_id ASC", null)) {
            while (c.moveToNext()) out.add(c.getString(0));
        }
        return out;
    }

    public synchronized int pendingCount(String tripId) {
        String sel = "uploaded=0" + (tripId == null || tripId.isEmpty() ? "" : " AND trip_id=?");
        String[] args = tripId == null || tripId.isEmpty() ? null : new String[]{tripId};
        try (Cursor c = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM points WHERE " + sel, args)) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    public synchronized void markUploaded(List<Long> ids) {
        if (ids.isEmpty()) return;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (Long id : ids) {
                ContentValues v = new ContentValues();
                v.put("uploaded", 1);
                db.update("points", v, "_id=?", new String[]{String.valueOf(id)});
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }

    public synchronized int remaining(String tripId) {
        return pendingCount(tripId);
    }

    public synchronized void deleteTrip(String tripId) {
        if (tripId == null || tripId.isEmpty()) return;
        getWritableDatabase().delete("points", "trip_id=?", new String[]{tripId});
    }

    private Point pointFromCursor(Cursor c) {
        int id=c.getColumnIndexOrThrow("_id");
        int ti=c.getColumnIndexOrThrow("trip_id");
        int tm=c.getColumnIndexOrThrow("time_ms");
        int la=c.getColumnIndexOrThrow("lat");
        int ln=c.getColumnIndexOrThrow("lng");
        int ac=c.getColumnIndexOrThrow("accuracy");
        int sp=c.getColumnIndexOrThrow("speed_kmh");
        int be=c.getColumnIndexOrThrow("bearing");
        int al=c.getColumnIndexOrThrow("altitude");
        return new Point(
                c.getLong(id), c.getString(ti), c.getLong(tm),
                c.getDouble(la), c.getDouble(ln), c.getDouble(ac), c.getDouble(sp),
                c.isNull(be) ? null : c.getDouble(be),
                c.isNull(al) ? null : c.getDouble(al)
        );
    }

    public static final class Point {
        public final long id; public final String tripId; public final long time;
        public final double lat,lng,accuracy,speedKmh; public final Double bearing,altitude;
        Point(long id,String tripId,long time,double lat,double lng,double accuracy,double speedKmh,Double bearing,Double altitude){
            this.id=id;this.tripId=tripId;this.time=time;this.lat=lat;this.lng=lng;this.accuracy=accuracy;this.speedKmh=speedKmh;this.bearing=bearing;this.altitude=altitude;
        }
        public JSObject toJson(){
            JSObject o=new JSObject();
            o.put("tripId",tripId);o.put("time",time);o.put("latitude",lat);o.put("longitude",lng);
            o.put("lat",lat);o.put("lng",lng);o.put("accuracy",accuracy);o.put("speedKmh",speedKmh);
            if(bearing!=null)o.put("bearing",bearing);
            if(altitude!=null)o.put("altitude",altitude);
            o.put("source","native-android");
            return o;
        }
        public JSONObject toUploadJson(){
            JSONObject o=new JSONObject();
            try{
                o.put("tripId",tripId);o.put("latitude",lat);o.put("longitude",lng);
                o.put("accuracy",accuracy);o.put("speedKmh",speedKmh);
                if(bearing!=null)o.put("bearing",bearing);else o.put("bearing",JSONObject.NULL);
                if(altitude!=null)o.put("altitude",altitude);else o.put("altitude",JSONObject.NULL);
                o.put("time",time);o.put("simulated",false);o.put("vehicle","Motor");o.put("source","native-android");
            }catch(Exception ignored){}
            return o;
        }
    }
}
