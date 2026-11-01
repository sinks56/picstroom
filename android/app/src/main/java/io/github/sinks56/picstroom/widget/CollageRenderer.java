package io.github.sinks56.picstroom.widget;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.text.TextPaint;
import android.text.TextUtils;

import java.util.List;

/** Draws the collage into one bitmap: true black, square corners, no gaps between pictures. */
public final class CollageRenderer {
    private CollageRenderer() {}

    /**
     * @param captions one per picture (empty string = none); may be null
     * @param fit      false = fill each cell (crop), true = whole picture on black
     * @param density  pixels per dp of the *rendered* bitmap, so caption size stays readable
     */
    public static Bitmap render(List<Bitmap> pics, List<String> captions, float[][] cells,
                                int w, int h, boolean fit, float density) {
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        canvas.drawColor(Color.BLACK);
        Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
        int[][] rects = CollageLayout.pixelRects(cells, w, h);

        TextPaint text = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(Color.WHITE);
        text.setTextSize(11f * density);
        text.setTypeface(Typeface.DEFAULT_BOLD);
        Paint scrim = new Paint();
        scrim.setColor(0xB3000000);

        for (int i = 0; i < pics.size() && i < rects.length; i++) {
            Bitmap b = pics.get(i);
            int[] r = rects[i];
            int cw = r[2] - r[0], ch = r[3] - r[1];
            if (cw <= 0 || ch <= 0 || b == null) continue;
            canvas.save();
            canvas.clipRect(r[0], r[1], r[2], r[3]);
            Rect src = new Rect(0, 0, b.getWidth(), b.getHeight());
            Rect dst;
            if (fit) {
                float s = Math.min(cw / (float) b.getWidth(), ch / (float) b.getHeight());
                int dw = Math.round(b.getWidth() * s), dh = Math.round(b.getHeight() * s);
                int dx = r[0] + (cw - dw) / 2, dy = r[1] + (ch - dh) / 2;
                dst = new Rect(dx, dy, dx + dw, dy + dh);
            } else {
                src = cropToFill(b.getWidth(), b.getHeight(), cw, ch);
                dst = new Rect(r[0], r[1], r[2], r[3]);
            }
            canvas.drawBitmap(b, src, dst, paint);

            String cap = captions != null && i < captions.size() ? captions.get(i) : "";
            if (cap != null && !cap.isEmpty()) {
                float pad = 5f * density;
                float maxText = cw - 2 * pad;
                if (maxText > 20 * density) {
                    CharSequence t = TextUtils.ellipsize(cap, text, maxText, TextUtils.TruncateAt.END);
                    float tw = text.measureText(t, 0, t.length());
                    float bandH = text.getTextSize() * 1.55f;
                    canvas.drawRect(r[0], r[3] - bandH, r[0] + tw + 2 * pad, r[3], scrim);
                    Paint.FontMetrics fm = text.getFontMetrics();
                    float baseline = r[3] - bandH / 2f - (fm.ascent + fm.descent) / 2f;
                    canvas.drawText(t, 0, t.length(), r[0] + pad, baseline, text);
                }
            }
            canvas.restore();
        }
        return out;
    }

    /** Source rectangle that fills cw x ch from a bw x bh picture (centre crop, slightly upward bias). */
    public static Rect cropToFill(int bw, int bh, int cw, int ch) {
        float s = Math.max(cw / (float) bw, ch / (float) bh);
        int sw = Math.min(bw, Math.round(cw / s));
        int sh = Math.min(bh, Math.round(ch / s));
        int sx = (bw - sw) / 2;
        int sy = Math.round((bh - sh) * 0.4f);
        return new Rect(sx, sy, sx + sw, sy + sh);
    }
}
