package com.rhhabits.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(RHTrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
