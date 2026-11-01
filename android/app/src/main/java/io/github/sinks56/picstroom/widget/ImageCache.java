package io.github.sinks56.picstroom.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;

/** Downloads pictures once, shrinks them to widget size and keeps them on disk. */
public final class ImageCache {
    public static final int MAX_SIDE = 1000;
    static final int MIN_SIDE = 200;                 // smaller pictures are icons / trackers, not content
    private static final long MAX_BYTES = 14L * 1024 * 1024;
    private static final long CACHE_LIMIT = 90L * 1024 * 1024;
    private static final long BAD_TTL = 12L * 3600 * 1000;
    static final String UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 PicStroomWidget";

    private ImageCache() {}

    static File dir(Context c) {
        File d = new File(c.getCacheDir(), "widget-img");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    static String key(String url) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] h = md.digest(url.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : h) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(url.hashCode());
        }
    }

    public static boolean has(Context c, String url) {
        return new File(dir(c), key(url) + ".jpg").exists();
    }

    /**
     * The picture as a bitmap (longest side <= MAX_SIDE), or null if it is unusable (too
     * small, undecodable) or not cached while downloads are not allowed.
     * @throws IOException when the network failed - the caller may then prefer cached pictures.
     */
    public static Bitmap load(Context c, String url, String referer, boolean allowNetwork) throws IOException {
        File f = new File(dir(c), key(url) + ".jpg");
        if (f.exists()) {
            Bitmap b = BitmapFactory.decodeFile(f.getAbsolutePath());
            if (b != null) {
                //noinspection ResultOfMethodCallIgnored
                f.setLastModified(System.currentTimeMillis());
                return b;
            }
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
        File bad = new File(dir(c), key(url) + ".bad");
        if (bad.exists()) {
            if (System.currentTimeMillis() - bad.lastModified() < BAD_TTL) return null;
            //noinspection ResultOfMethodCallIgnored
            bad.delete();
        }
        if (!allowNetwork) return null;

        byte[] data;
        try {
            data = download(url, referer);
        } catch (IOException direct) {
            // Hot-link protection or a blocked host: ask the resizing proxy the web app also uses.
            try {
                data = download("https://wsrv.nl/?w=" + MAX_SIDE + "&output=jpg&url=" + URLEncoder.encode(url, "UTF-8"), null);
            } catch (IOException viaProxy) {
                throw direct;
            }
        }
        Bitmap b = decodeScaled(data);
        if (b == null || Math.min(b.getWidth(), b.getHeight()) < MIN_SIDE) {
            try { new FileOutputStream(bad).close(); } catch (IOException ignored) { }
            return null;
        }
        try (FileOutputStream out = new FileOutputStream(f)) {
            b.compress(Bitmap.CompressFormat.JPEG, 86, out);
        } catch (IOException ignored) { /* still usable this time */ }
        return b;
    }

    static Bitmap decodeScaled(byte[] data) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, o);
        if (o.outWidth <= 0 || o.outHeight <= 0) return null;
        int sample = 1;
        while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2;
        o = new BitmapFactory.Options();
        o.inSampleSize = sample;
        Bitmap b = BitmapFactory.decodeByteArray(data, 0, data.length, o);
        if (b == null) return null;
        int side = Math.max(b.getWidth(), b.getHeight());
        if (side > MAX_SIDE) {
            float s = MAX_SIDE / (float) side;
            Bitmap scaled = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * s)), Math.max(1, Math.round(b.getHeight() * s)), true);
            if (scaled != b) b.recycle();
            b = scaled;
        }
        return b;
    }

    static byte[] download(String url, String referer) throws IOException {
        String current = url;
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
            try {
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(10000);
                c.setReadTimeout(20000);
                c.setRequestProperty("User-Agent", UA);
                c.setRequestProperty("Accept", "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8");
                if (referer != null && referer.startsWith("http")) c.setRequestProperty("Referer", referer);
                int code = c.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = c.getHeaderField("Location");
                    if (loc == null) throw new IOException("redirect without location");
                    current = new URL(new URL(current), loc).toString();
                    if (!current.startsWith("https://")) throw new IOException("insecure redirect");
                    continue;
                }
                if (code != 200) throw new IOException("HTTP " + code);
                long len = c.getContentLengthLong();
                if (len > MAX_BYTES) throw new IOException("too large");
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream(len > 0 ? (int) len : 65536);
                    byte[] buf = new byte[16384];
                    int n;
                    long total = 0;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > MAX_BYTES) throw new IOException("too large");
                        bo.write(buf, 0, n);
                    }
                    return bo.toByteArray();
                }
            } finally {
                c.disconnect();
            }
        }
        throw new IOException("too many redirects");
    }

    /** Keeps the cache under its size limit by deleting the least recently used pictures. */
    public static void trim(Context c) {
        File[] files = dir(c).listFiles();
        if (files == null) return;
        long total = 0;
        for (File f : files) total += f.length();
        if (total <= CACHE_LIMIT) return;
        Arrays.sort(files, new Comparator<File>() {
            @Override public int compare(File a, File b) { return Long.compare(a.lastModified(), b.lastModified()); }
        });
        for (File f : files) {
            if (total <= CACHE_LIMIT * 3 / 4) break;
            total -= f.length();
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }
}
