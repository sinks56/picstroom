package io.github.sinks56.picstroom.widget;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** Runs one widget update in the background (one-off, or periodic for the refresh interval). */
public class RenderWorker extends Worker {
    public RenderWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        int id = getInputData().getInt("id", 0);
        int action = getInputData().getInt("action", WidgetUpdater.A_INIT);
        try {
            WidgetUpdater.update(getApplicationContext(), id, action, new WidgetUpdater.Cancel() {
                @Override public boolean isCancelled() { return isStopped(); }
            });
        } catch (Throwable t) {
            Log.w("PicStroomWidget", "update failed", t);
        }
        return Result.success();
    }
}
