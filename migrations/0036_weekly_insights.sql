-- ANA-08: immutable aggregate snapshots. Existing Inbox tables and foreign keys are untouched.
CREATE TABLE weekly_insights (
  week_start TEXT PRIMARY KEY CHECK(length(week_start)=10 AND date(week_start,'+0 days') IS week_start AND strftime('%w',week_start)='1'),
  week_until TEXT NOT NULL CHECK(week_until=date(week_start,'+7 days')),
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload) AND json_type(payload)='object' AND json_extract(payload,'$.version') IS 1)
) WITHOUT ROWID;

-- One statement owns the snapshot, audit event and informational notice: any failure rolls everything back.
CREATE TRIGGER weekly_insights_notice AFTER INSERT ON weekly_insights BEGIN
  INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(NEW.generated_at,'system','admin','weekly-insights:'||NEW.week_start,'analytics.weekly_created',
      json_object('version',1,'from',NEW.week_start,'until',NEW.week_until));
  INSERT INTO notifications(event_id,category,title,action_required,created_at,task_key,source_version,target_kind,target_id)
    VALUES(last_insert_rowid(),'message','Weekly Insights · '||NEW.week_start||'–'||date(NEW.week_until,'-1 day'),
      0,NEW.generated_at,'insights:weekly:'||NEW.week_start,last_insert_rowid(),'collection','weekly-insights:'||NEW.week_start);
END;
