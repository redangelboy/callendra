"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function initSocket(slug: string, onEvent: () => void) {
  const win = window as any;
  if (win._callendrSocket) {
    win._callendrSocket.disconnect();
    win._callendrSocket = null;
  }
  const connect = () => {
    const socket = win.io(win.location.origin, { transports: ["websocket", "polling"] });
    win._callendrSocket = socket;
    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      socket.emit("join-display", slug);
      console.log("Joined room: display-" + slug);
    });
    socket.on("new-appointment", () => {
      console.log("New appointment received!");
      onEvent();
    });
  };
  if (win.io) {
    connect();
  } else {
    const script = document.createElement("script");
    script.src = "/socket.io/socket.io.js";
    script.onload = connect;
    document.head.appendChild(script);
  }
}

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
    initSocket(slug, fetchAppointments);
    return () => {
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [slug]);

  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const formatClock = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const staff = business?.staff || [];
  const byStaff = staff.map((s: any) => ({
    ...s,
    appointments: appointments
      .filter((a: any) => a.staffId === s.id)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  }));

  if (!business) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-white text-xl animate-pulse">Loading display...</div>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
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
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(staff.length, 4)}, 1fr)` }}>
        {byStaff.map((s: any) => (
          <div key={s.id} className="bg-gray-900 rounded-2xl overflow-hidden">
            <div className="bg-white/5 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center font-bold text-green-400 text-lg">
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-lg">{s.name}</div>
                <div className="text-xs text-gray-400">{s.appointments.length} appointments</div>
              </div>
            </div>
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
                          <div className={`font-semibold ${isNext ? "text-green-400" : "text-white"}`}>{apt.clientName}</div>
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
      <div className="mt-8 text-center text-gray-700 text-xs">
        Auto-refreshes every 30 seconds · Powered by Callendra
      </div>
    </main>
  );
}
