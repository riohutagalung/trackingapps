package com.rhhabits.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class RHTrackingUploader {
    private RHTrackingUploader() {}

    static final class SyncResult {
        final Set<String> tripIds = new LinkedHashSet<>();
        int remaining = 0;
    }

    static SyncResult syncAll(Context context, String endpoint, int timeoutMs) throws Exception {
        TrackingDb db = TrackingDb.get(context);
        SyncResult result = new SyncResult();
        Set<String> ids = db.getPendingTripIds();
        for (String tripId : ids) {
            while (true) {
                List<TrackingDb.Point> batch = db.getPending(tripId, 25);
                if (batch.isEmpty()) break;
                boolean ok = postBatch(endpoint, tripId, batch, timeoutMs);
                if (!ok) break;
                ArrayList<Long> uploaded = new ArrayList<>();
                for (TrackingDb.Point p : batch) uploaded.add(p.id);
                db.markUploaded(uploaded);
                result.tripIds.add(tripId);
            }
        }
        for (String tripId : ids) result.remaining += db.remaining(tripId);
        return result;
    }

    private static boolean postBatch(String endpoint, String tripId, List<TrackingDb.Point> points, int timeoutMs) {
        HttpURLConnection con = null;
        try {
            JSONArray arr = new JSONArray();
            for (TrackingDb.Point p : points) arr.put(p.toUploadJson());
            JSONObject body = new JSONObject();
            body.put("tripId", tripId);
            body.put("points", arr);

            URL url = new URL(endpoint + "?tripId=" + java.net.URLEncoder.encode(tripId, "UTF-8"));
            con = (HttpURLConnection) url.openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(timeoutMs);
            con.setReadTimeout(timeoutMs);
            con.setUseCaches(false);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            con.setRequestProperty("Accept", "application/json");
            byte[] bytes = body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
            con.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream os = con.getOutputStream()) { os.write(bytes); }

            int code = con.getResponseCode();
            InputStream stream = code >= 200 && code < 300 ? con.getInputStream() : con.getErrorStream();
            String text = readAll(stream);
            if (code < 200 || code >= 300) return false;
            try {
                JSONObject response = new JSONObject(text == null || text.isEmpty() ? "{}" : text);
                return response.optBoolean("ok", false);
            } catch (Exception ignored) {
                return true;
            }
        } catch (Exception e) {
            return false;
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String readAll(InputStream in) throws Exception {
        if (in == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(in, java.nio.charset.StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }
}
