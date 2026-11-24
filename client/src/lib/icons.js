// Lucide icons by name — the server's KPI registry refers to icons as strings.
import {
  Activity, AlertTriangle, Atom, AudioWaveform, BatteryCharging, Boxes, CalendarCheck, Camera, CheckCircle2, Clock, Cloud, Cog, Copy, Crosshair,
  Database, Droplets, Factory, Fan, FlaskConical, Flame, Gauge, GitBranch, HardDrive, IndianRupee, Layers, Leaf, PauseCircle, PieChart, Plug, Radio,
  Recycle, Scale, ScanLine, ShieldAlert, ShieldCheck, Sigma, Snowflake, Sparkles, Sun, Target, TestTube, Thermometer, Timer, Truck, Waves, Wind, XOctagon, Zap,
} from 'lucide-react';

const MAP = {
  Activity, AlertTriangle, Atom, AudioWaveform, BatteryCharging, Boxes, CalendarCheck, Camera, CheckCircle2, Clock, Cloud, Cog, Copy, Crosshair,
  Database, Droplets, Factory, Fan, FlaskConical, Flame, Gauge, GitBranch, HardDrive, IndianRupee, Layers, Leaf, PauseCircle, PieChart, Plug, Radio,
  Recycle, Scale, ScanLine, ShieldAlert, ShieldCheck, Sigma, Snowflake, Sparkles, Sun, Target, TestTube, Thermometer, Timer, Truck, Waves, Wind, XOctagon, Zap,
};

export function KpiIcon({ name, size = 16 }) {
  const I = MAP[name] || Activity;
  return <I size={size} strokeWidth={1.75} />;
}
