import * as React from 'react';
import * as signalR from '@microsoft/signalr';
import type { Notice } from '@/types/notice';

type UseSignalRNoticeArgs = {
  enabled: boolean;
  clientId: string;
  systemApiBaseUrl: string;
  onEmergencyNotice: (notice: Notice) => void;
};

/** Real-time emergency notice push. No-ops entirely when systemApiBaseUrl is blank (dev). */
export function useSignalRNotice(args: UseSignalRNoticeArgs) {
  const { enabled, clientId, systemApiBaseUrl, onEmergencyNotice } = args;

  React.useEffect(() => {
    if (!enabled || !clientId || !systemApiBaseUrl) return;

    const apiIndex = systemApiBaseUrl.indexOf('/api');
    const hubBaseUrl = apiIndex >= 0 ? systemApiBaseUrl.slice(0, apiIndex) : systemApiBaseUrl;
    const hubUrl = `${hubBaseUrl}/systemHub?conSigR=sys&type=WebApp&Code=Calypso&url=${window.location.origin}`;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, { accessTokenFactory: () => clientId })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build();

    let disposed = false;
    let started = false;

    connection.on('emergencyNotice/Calypso', (data: unknown) => {
      const notice = Array.isArray(data) ? data[0] : data;
      if (notice) onEmergencyNotice(notice as Notice);
    });

    const startConnection = async () => {
      try {
        await connection.start();
        started = true;
        if (disposed) await connection.stop();
      } catch {
        // SYSTEM_API not reachable — real-time push simply stays off.
      }
    };

    void startConnection();

    return () => {
      disposed = true;
      if (started) void connection.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, clientId, systemApiBaseUrl, onEmergencyNotice]);
}
