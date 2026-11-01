package io.github.sinks56.picstroom.widget;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives the app's feeds / pictures / favourites snapshot and refreshes any widgets on screen. */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {
    @PluginMethod
    public void sync(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json required");
            return;
        }
        try {
            WidgetStore.saveSnapshot(getContext(), json);
            WidgetUpdater.enqueueAll(getContext(), WidgetUpdater.A_SYNC);
            call.resolve();
        } catch (Exception e) {
            call.reject("sync failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject o = new JSObject();
        o.put("widgets", WidgetStore.widgetIds(getContext()).size());
        call.resolve(o);
    }
}
