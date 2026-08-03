import { useEffect, useState } from 'react';
import { User, Heart } from 'lucide-react';

interface RecentDonation {
  id: string;
  donorName: string;
  amount: number;
  timestamp: Date;
  message?: string;
}

export function DonationTicker() {
  const [donations, setDonations] = useState<RecentDonation[]>([]);
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    // Simular datos - en producción venir de WebSocket o polling
    const mockDonations: RecentDonation[] = [
      { id: '1', donorName: 'María G.', amount: 50, timestamp: new Date(), message: '¡Sigan así!' },
      { id: '2', donorName: 'Carlos R.', amount: 100, timestamp: new Date(Date.now() - 60000), message: '' },
      { id: '3', donorName: 'Anónimo', amount: 25, timestamp: new Date(Date.now() - 120000), message: 'Por los perritos' },
    ];
    setDonations(mockDonations);
    setViewerCount(Math.floor(Math.random() * 20) + 5);

    // Polling cada 30s
    const interval = setInterval(() => {
      setViewerCount(prev => Math.max(1, prev + Math.floor(Math.random() * 5) - 2));
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-blue-700">
          <User className="w-4 h-4" />
          <span>{viewerCount} personas están viendo esta campaña</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          En vivo
        </div>
      </div>
      
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Donaciones recientes:</p>
        <div className="space-y-1">
          {donations.slice(0, 3).map((donation) => (
            <div key={donation.id} className="flex items-center justify-between text-sm animate-fade-in">
              <div className="flex items-center gap-2">
                <Heart className="w-3 h-3 text-red-500 fill-red-500" />
                <span className="font-medium text-gray-800">{donation.donorName}</span>
                {donation.message && (
                  <span className="text-gray-500 italic text-xs">"{donation.message}"</span>
                )}
              </div>
              <span className="font-bold text-green-600">S/ {donation.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
