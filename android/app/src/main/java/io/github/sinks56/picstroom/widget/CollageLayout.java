package io.github.sinks56.picstroom.widget;

import java.util.ArrayList;
import java.util.List;

/**
 * Collage layouts for 1-5 pictures: nested splits with no gaps between cells.
 * The same table feeds tools/gen_widget_layouts.py, which generates the matching
 * tap-target layouts (res/layout/widget_*.xml) - keep both in step.
 *
 * Syntax: leaf = picture index; H(w:node,w:node,...) = side by side; V(...) = stacked.
 * "Tall" widgets use the transposed layout (H and V swapped) so cells stay roughly square.
 */
public final class CollageLayout {
    /** name | spec */
    public static final String[] SPECS = {
            "c1|0",
            "c2_even|H(1:0,1:1)",
            "c2_hero|H(2:0,1:1)",
            "c3_even|H(1:0,1:1,1:2)",
            "c3_hero|H(2:0,1:V(1:1,1:2))",
            "c4_even|V(1:H(1:0,1:1),1:H(1:2,1:3))",
            "c4_hero|H(2:0,1:V(1:1,1:2,1:3))",
            "c5_even|V(1:H(1:0,1:1,1:2),1:H(1:3,1:4))",
            "c5_hero|H(2:0,1:V(1:H(1:1,1:2),1:H(1:3,1:4)))",
    };

    private CollageLayout() {}

    public static String specFor(int count, boolean hero) {
        count = Math.max(1, Math.min(5, count));
        String name = count == 1 ? "c1" : "c" + count + (hero ? "_hero" : "_even");
        for (String s : SPECS) if (s.startsWith(name + "|")) return s.substring(name.length() + 1);
        throw new IllegalStateException(name);
    }

    /** Resource name of the widget layout, e.g. widget_c3_hero_w (wide) / widget_c3_hero_t (tall). */
    public static String layoutName(int count, boolean hero, boolean tall) {
        count = Math.max(1, Math.min(5, count));
        if (count == 1) return "widget_c1";
        return "widget_c" + count + (hero ? "_hero" : "_even") + (tall ? "_t" : "_w");
    }

    /** Tall when clearly taller than wide. */
    public static boolean isTall(float widthPx, float heightPx) {
        return heightPx > widthPx * 1.2f;
    }

    /** Cells as {x, y, w, h} fractions of the widget, indexed by picture number. */
    public static float[][] cells(int count, boolean hero, boolean tall) {
        String spec = specFor(count, hero);
        int n = Math.max(1, Math.min(5, count));
        float[][] out = new float[n][];
        new Parser(spec, tall, out).node(0f, 0f, 1f, 1f);
        return out;
    }

    /** Integer pixel rects (left, top, right, bottom) that tile the area exactly. */
    public static int[][] pixelRects(float[][] cells, int w, int h) {
        int[][] r = new int[cells.length][];
        for (int i = 0; i < cells.length; i++) {
            float[] c = cells[i];
            r[i] = new int[]{Math.round(c[0] * w), Math.round(c[1] * h), Math.round((c[0] + c[2]) * w), Math.round((c[1] + c[3]) * h)};
        }
        return r;
    }

    // ---- tiny parser: spec -> cells -------------------------------------------------

    private static final class Parser {
        final String s;
        final boolean transpose;
        final float[][] out;
        int p = 0;

        Parser(String s, boolean transpose, float[][] out) {
            this.s = s; this.transpose = transpose; this.out = out;
        }

        void node(float x, float y, float w, float h) {
            char c = s.charAt(p);
            if (c != 'H' && c != 'V') {
                out[readInt()] = new float[]{x, y, w, h};
                return;
            }
            boolean horizontal = (c == 'H') != transpose;
            p += 2; // letter and '('
            // Children are "weight:node"; read weights first so fractions are known.
            List<Integer> weights = new ArrayList<>();
            List<Integer> starts = new ArrayList<>();
            int total = 0;
            while (true) {
                int wt = readInt();
                p++; // ':'
                weights.add(wt);
                total += wt;
                starts.add(p);
                skipNode();
                if (s.charAt(p) == ',') { p++; continue; }
                break;
            }
            int end = p; // at ')'
            float offset = 0f;
            for (int i = 0; i < weights.size(); i++) {
                float frac = weights.get(i) / (float) total;
                p = starts.get(i);
                if (horizontal) node(x + offset * w, y, w * frac, h);
                else node(x, y + offset * h, w, h * frac);
                offset += frac;
            }
            p = end + 1;
        }

        void skipNode() {
            char c = s.charAt(p);
            if (c == 'H' || c == 'V') {
                int depth = 0;
                p++; // the H / V letter
                do {
                    char d = s.charAt(p++);
                    if (d == '(') depth++;
                    else if (d == ')') depth--;
                } while (depth > 0);
            } else {
                readInt();
            }
        }

        int readInt() {
            int start = p;
            while (p < s.length() && Character.isDigit(s.charAt(p))) p++;
            return Integer.parseInt(s.substring(start, p));
        }
    }
}
