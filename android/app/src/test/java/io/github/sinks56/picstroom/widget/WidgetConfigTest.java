package io.github.sinks56.picstroom.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WidgetConfigTest {
    @Test
    public void roundTripsEverySetting() {
        WidgetConfig c = new WidgetConfig(WidgetConfig.KIND_SEL);
        c.count = 5; c.layout = WidgetConfig.LAYOUT_EVEN; c.refreshMin = 360; c.tap = WidgetConfig.TAP_SHUFFLE;
        c.caption = true; c.fit = true; c.wifiOnly = true; c.days = 30; c.shuffleButton = false;
        c.feedIds.add("x"); c.feedIds.add("y");
        WidgetConfig d = WidgetConfig.fromJson(c.toJson());
        assertEquals(WidgetConfig.KIND_SEL, d.kind);
        assertEquals(5, d.count);
        assertFalse(d.hero());
        assertEquals(360, d.refreshMin);
        assertEquals(WidgetConfig.TAP_SHUFFLE, d.tap);
        assertTrue(d.caption && d.fit && d.wifiOnly);
        assertFalse(d.shuffleButton);
        assertEquals(30, d.days);
        assertEquals(c.feedIds, d.feedIds);
    }

    @Test
    public void clampsNonsense() {
        WidgetConfig c = new WidgetConfig();
        c.count = 99; c.layout = "weird"; c.tap = "weird"; c.refreshMin = 7; c.days = -4; c.kind = "weird";
        c.clamp();
        assertEquals(5, c.count);
        assertEquals(WidgetConfig.LAYOUT_FEATURE, c.layout);
        assertEquals(WidgetConfig.TAP_OPEN, c.tap);
        assertEquals(60, c.refreshMin);
        assertEquals(0, c.days);
        assertEquals(WidgetConfig.KIND_ALL, c.kind);
        c.count = 0;
        assertEquals(1, c.clamp().count);
    }

    @Test
    public void missingFieldsGetDefaultsAndGarbageIsRejected() {
        WidgetConfig c = WidgetConfig.fromJson("{\"kind\":\"favs\"}");
        assertEquals(2, c.count);
        assertTrue(c.shuffleButton);
        assertNull(WidgetConfig.fromJson("not json"));
    }

    @Test
    public void newestFirstFavouritesCannotShuffle() {
        WidgetConfig c = new WidgetConfig(WidgetConfig.KIND_FAVS);
        assertTrue(c.canShuffle());
        c.order = WidgetConfig.ORDER_NEWEST;
        assertFalse(c.canShuffle());
    }

    @Test
    public void widgetPixelsStayWithinRemoteViewsBudget() {
        int[] px = WidgetUpdater.fitPixels(400, 800, 3f);
        assertTrue(px[0] * px[1] <= 900_000);
        assertTrue(Math.max(px[0], px[1]) <= 1000);
        int[] small = WidgetUpdater.fitPixels(110, 110, 2f);
        assertEquals(220, small[0]);
        assertEquals(220, small[1]);
    }
}
