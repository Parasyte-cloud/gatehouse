type ParasyteSceneProps = {
  className?: string
}

export default function ParasyteScene({ className = '' }: ParasyteSceneProps) {
  return (
    <div className={`parasyteScene ${className}`.trim()} aria-hidden="true">
      <span className="parasyteSceneStars" />
      <span className="parasyteScenePlanet" />
      <span className="parasyteSceneGoldArc" />
      <span className="parasyteSceneSun" />
      <span className="parasyteSceneMountain parasyteSceneMountainLeft" />
      <span className="parasyteSceneMountain parasyteSceneMountainLeftBack" />
      <span className="parasyteSceneMountain parasyteSceneMountainRight" />
      <span className="parasyteSceneMountain parasyteSceneMountainRightBack" />
      <span className="parasyteSceneWater" />
      <span className="parasyteSceneReflection parasyteSceneReflectionGold" />
      <span className="parasyteSceneReflection parasyteSceneReflectionBlue" />
      <span className="parasyteSceneVignette" />
    </div>
  )
}
