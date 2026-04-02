"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function DisplayPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [business, setBusiness] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());

  const fetchAppointments = async () => {
    const res = await fetch(`/api/display?slug=${slug}`);
    const data = await res.json();
    if (data.business) setBusiness(data.business);
    if (Array.isArray(data.appointments)) setAppointments(data.appointments);
  };

  useEffect(() => {
    fetchAppointments();
    const interval = setInterval(fetchAppointments, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);
  
    // Socket.io tiempo real
    import("socket.io-client").then(({ io }) => {
      const socket = io();
      socket.emit("join-display", slug);
      socket.on("new-appointment", fetchAppointments);
    });
  
    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [slug]);

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  const formatClock = (d: Date) => {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  // Agrupar citas por barbero
  const staff = business?.staff || [];
  const byStaff = staff.map((s: any) => ({
    ...s,
    appointments: appointments
      .filter((a) => a.staffId === s.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  }));

  if (!business) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-white text-xl animate-pulse">Loading display...</div>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{business.name}</h1>
          <p className="text-gray-400 mt-1">{DAYS[now.getDay()]}, {now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        <div className="text-right">
          <div className="text-5xl font-mono font-bold text-green-400">{formatClock(now)}</div>
          <div className="text-gray-400 text-sm mt-1">{appointments.length} appointments today</div>
        </div>
      </div>

      {/* Grid por barbero */}
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(staff.length, 4)}, 1fr)` }}>
        {byStaff.map((s: any) => (
          <div key={s.id} className="bg-gray-900 rounded-2xl overflow-hidden">
            {/* Barbero header */}
            <div className="bg-white/5 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center font-bold text-green-400 text-lg">
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-lg">{s.name}</div>
                <div className="text-xs text-gray-400">{s.appointments.length} appointments</div>
              </div>
            </div>

            {/* Citas */}
            <div className="p-4 flex flex-col gap-3">
              {s.appointments.length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  <div className="text-3xl mb-2">📅</div>
                  <div className="text-sm">No appointments</div>
                </div>
              ) : (
                s.appointments.map((apt: any) => {
                  const aptTime = new Date(apt.date);
                  const isPast = aptTime < now;
                  const isNext = !isPast && s.appointments.findIndex((a: any) => new Date(a.date) >= now) === s.appointments.indexOf(apt);
                return (
                    <div key={apt.id} className={`rounded-xl px-4 py-3 border transition ${
                      isNext ? "bg-green-500/10 border-green-500/30" :
                      isPast ? "bg-white/3 border-white/5 opacity-40" :
                      "bg-white/5 border-white/10"
                    }`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className={`font-semibold ${isNext ? "text-green-400" : "text-white"}`}>
                            {apt.clientName}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{apt.service?.name}</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-mono font-bold text-lg ${isNext ? "text-green-400" : isPast ? "text-gray-600" : "text-white"}`}>
                            {formatTime(apt.date)}
                          </div>
                          {isNext && <div className="text-xs text-green-500 font-medium">NEXT</div>}
                          {isPast && <div className="text-xs text-gray-600">Done</div>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-gray-700 text-xs">
        Auto-refreshes every 30 seconds · Powered by Callendra
      </div>
    </main>
  );
}
