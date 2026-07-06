export function WellLogStrip() {
  const colors = [
    '#9c2b2b', '#c89b3c', '#5b8aa6', '#5b9c6e',
    '#7a2e2b', '#b3433f', '#c89b3c', '#9c2b2b',
  ];

  return (
    <div className="flex h-[3px] w-full">
      {colors.map((color, i) => (
        <span key={i} className="flex-1" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}
