package io.github.sinks56.picstroom.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;

import java.io.File;

import javax.xml.parsers.DocumentBuilderFactory;

public class CollageLayoutTest {
    private static final String ANDROID_NS = "http://schemas.android.com/apk/res/android";

    @Test
    public void cellsTileTheWholeWidgetWithoutGapsOrOverlap() {
        for (int count = 1; count <= 5; count++) {
            for (boolean hero : new boolean[]{true, false}) {
                for (boolean tall : new boolean[]{true, false}) {
                    float[][] cells = CollageLayout.cells(count, hero, tall);
                    assertEquals(count, cells.length);
                    int w = 997, h = 613; // awkward size on purpose
                    int[][] rects = CollageLayout.pixelRects(cells, w, h);
                    int[][] cover = new int[h][w];
                    for (int i = 0; i < count; i++) {
                        assertNotNull("cell " + i, cells[i]);
                        int[] r = rects[i];
                        assertTrue(r[2] > r[0] && r[3] > r[1]);
                        for (int y = r[1]; y < r[3]; y++) for (int x = r[0]; x < r[2]; x++) cover[y][x]++;
                    }
                    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                        assertEquals("count=" + count + " hero=" + hero + " tall=" + tall + " at " + x + "," + y, 1, cover[y][x]);
                    }
                }
            }
        }
    }

    @Test
    public void heroCellIsTheBiggest() {
        for (int count = 2; count <= 5; count++) {
            float[][] c = CollageLayout.cells(count, true, false);
            float hero = c[0][2] * c[0][3];
            for (int i = 1; i < count; i++) assertTrue(hero > c[i][2] * c[i][3]);
        }
    }

    @Test
    public void tallWidgetsGetTheTransposedLayout() {
        float[][] wide = CollageLayout.cells(3, true, false);
        float[][] tall = CollageLayout.cells(3, true, true);
        assertEquals(wide[0][2], tall[0][3], 1e-6);
        assertEquals(wide[0][3], tall[0][2], 1e-6);
        assertTrue(CollageLayout.isTall(100, 200));
        assertTrue(!CollageLayout.isTall(200, 200));
    }

    /** The generated tap-target layouts must describe exactly the same cells as the collage. */
    @Test
    public void generatedLayoutsMatchTheCollageCells() throws Exception {
        File dir = new File("src/main/res/layout");
        assertTrue("run from the android/app module: " + dir.getAbsolutePath(), dir.isDirectory());
        for (int count = 1; count <= 5; count++) {
            for (boolean hero : new boolean[]{true, false}) {
                for (boolean tall : new boolean[]{false, true}) {
                    String name = CollageLayout.layoutName(count, hero, tall);
                    File f = new File(dir, name + ".xml");
                    assertTrue("missing " + f, f.exists());
                    DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
                    dbf.setNamespaceAware(true);
                    Document doc = dbf.newDocumentBuilder().parse(f);
                    Element root = doc.getDocumentElement();
                    float[][] fromXml = new float[count][];
                    // second element child of the FrameLayout = tap-target tree (first is the collage ImageView)
                    Element hits = null;
                    int seen = 0;
                    for (Node n = root.getFirstChild(); n != null; n = n.getNextSibling()) {
                        if (n instanceof Element && seen++ == 1) hits = (Element) n;
                    }
                    assertNotNull(name, hits);
                    walk(hits, 0, 0, 1, 1, fromXml);
                    float[][] expected = CollageLayout.cells(count, hero, tall);
                    for (int i = 0; i < count; i++) {
                        assertNotNull(name + " hit" + i, fromXml[i]);
                        for (int k = 0; k < 4; k++) assertEquals(name + " hit" + i + "[" + k + "]", expected[i][k], fromXml[i][k], 1e-5);
                    }
                }
            }
        }
    }

    private static void walk(Element e, float x, float y, float w, float h, float[][] out) {
        String id = e.getAttributeNS(ANDROID_NS, "id");
        if (e.getTagName().equals("FrameLayout")) {
            int idx = Integer.parseInt(id.substring(id.length() - 1));
            out[idx] = new float[]{x, y, w, h};
            return;
        }
        boolean horizontal = e.getAttributeNS(ANDROID_NS, "orientation").equals("horizontal");
        float total = 0;
        for (Node n = e.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element) total += weight((Element) n);
        }
        float off = 0;
        for (Node n = e.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (!(n instanceof Element)) continue;
            Element c = (Element) n;
            float frac = weight(c) / total;
            if (horizontal) walk(c, x + off * w, y, w * frac, h, out);
            else walk(c, x, y + off * h, w, h * frac, out);
            off += frac;
        }
    }

    private static float weight(Element e) {
        String v = e.getAttributeNS(ANDROID_NS, "layout_weight");
        return v.isEmpty() ? 1f : Float.parseFloat(v);
    }
}
