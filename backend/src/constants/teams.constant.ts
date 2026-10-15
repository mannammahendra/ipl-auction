export interface FranchiseTeamConfig {
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  logo: string;
}

export const DEFAULT_TEAMS: FranchiseTeamConfig[] = [
  { name: 'Chennai Super Kings', shortName: 'CSK', color: '#FACC15', secondaryColor: '#CA8A04', logo: '/logos/csk.png' },
  { name: 'Mumbai Indians', shortName: 'MI', color: '#0284C7', secondaryColor: '#0369A1', logo: '/logos/mi.png' },
  { name: 'Royal Challengers Bengaluru', shortName: 'RCB', color: '#DC2626', secondaryColor: '#991B1B', logo: '/logos/rcb.png' },
  { name: 'Kolkata Knight Riders', shortName: 'KKR', color: '#7C3AED', secondaryColor: '#5B21B6', logo: '/logos/kkr.png' },
  { name: 'Sunrisers Hyderabad', shortName: 'SRH', color: '#EA580C', secondaryColor: '#C2410C', logo: '/logos/srh.png' },
  { name: 'Rajasthan Royals', shortName: 'RR', color: '#EC4899', secondaryColor: '#BE185D', logo: '/logos/rr.png' },
  { name: 'Gujarat Titans', shortName: 'GT', color: '#1E3A8A', secondaryColor: '#0F172A', logo: '/logos/gt.png' },
  { name: 'Lucknow Super Giants', shortName: 'LSG', color: '#06B6D4', secondaryColor: '#0E7490', logo: '/logos/lsg.png' },
  { name: 'Delhi Capitals', shortName: 'DC', color: '#2563EB', secondaryColor: '#B91C1C', logo: '/logos/dc.png' },
  { name: 'Punjab Kings', shortName: 'PBKS', color: '#E11D48', secondaryColor: '#9F1239', logo: '/logos/pbks.png' },
];
