package io.github.sinks56.picstroom.widget;

import android.content.Context;

import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/** Periodic refresh per widget, and the shared background feed fetch. */
public final class WidgetScheduler {
    private WidgetScheduler() {}

    /** Android's periodic work cannot run more often than every 15 minutes. */
    public static void schedule(Context ctx, int id, WidgetConfig cfg) {
        WorkManager wm = WorkManager.getInstance(ctx.getApplicationContext());
        String name = "refresh-" + id;
        if (cfg.refreshMin <= 0) {
            wm.cancelUniqueWork(name);
            return;
        }
        Data data = new Data.Builder().putInt("id", id).putInt("action", WidgetUpdater.A_REFRESH).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(RenderWorker.class, Math.max(15, cfg.refreshMin), TimeUnit.MINUTES)
                .setInputData(data).build();
        wm.enqueueUniquePeriodicWork(name, ExistingPeriodicWorkPolicy.UPDATE, req);
    }

    public static void cancel(Context ctx, int id) {
        WorkManager wm = WorkManager.getInstance(ctx.getApplicationContext());
        wm.cancelUniqueWork("refresh-" + id);
        wm.cancelUniqueWork("render-" + id);
    }

    /** Every 6 hours, fetch the feeds that random widgets draw from so they get new pictures without the app. */
    public static void ensureFeedSync(Context ctx) {
        WorkManager wm = WorkManager.getInstance(ctx.getApplicationContext());
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(FeedSyncWorker.class, 6, TimeUnit.HOURS).build();
        wm.enqueueUniquePeriodicWork("feed-sync", ExistingPeriodicWorkPolicy.KEEP, req);
    }

    public static void kickFeedSync(Context ctx) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(FeedSyncWorker.class).build();
        WorkManager.getInstance(ctx.getApplicationContext()).enqueueUniqueWork("feed-sync-now", ExistingWorkPolicy.KEEP, req);
    }

    public static void cancelFeedSync(Context ctx) {
        WorkManager wm = WorkManager.getInstance(ctx.getApplicationContext());
        wm.cancelUniqueWork("feed-sync");
        wm.cancelUniqueWork("feed-sync-now");
    }
}
