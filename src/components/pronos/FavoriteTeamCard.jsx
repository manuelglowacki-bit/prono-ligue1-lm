import BonusMatchCard from "./BonusMatchCard";

export default function FavoriteTeamCard({
  bonusChoices = [],
  selectedBonus,
  onSelectBonus,
  bonusScore = { home: "", away: "" },
  onBonusScoreChange
}) {
  return (
    <BonusMatchCard
      bonusChoices={bonusChoices}
      selectedBonus={selectedBonus}
      onSelectBonus={onSelectBonus}
      bonusScore={bonusScore}
      onBonusScoreChange={onBonusScoreChange}
    />
  );
}