package io.github.sinks56.picstroom;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import io.github.sinks56.picstroom.widget.WidgetBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
