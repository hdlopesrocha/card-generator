import { Zone, type Card } from '@/models/Card'

/**
 * Demo cards created on first launch so the three zone themes are visible
 * immediately. They are regular cards and can be edited or deleted.
 *
 * English is stored on the base fields; every other supported language has a
 * complete translation so the language selector is demonstrative out of the
 * box.
 */
export function createSampleCards(): Card[] {
  return [
    {
      id: 'sample-warrior',
      title: 'Warrior',
      subtitle: 'Frontline Fighter',
      attack: 120,
      defense: 90,
      action: 'Charge the nearest enemy and gain additional attack power.',
      image: null,
      zone: Zone.ATTACK,
      stars: 3,
      translations: {
        PT: {
          title: 'Guerreiro',
          subtitle: 'Combatente da Linha de Frente',
          action:
            'Carregue contra o inimigo mais próximo e ganhe poder de ataque adicional.',
        },
        FR: {
          title: 'Guerrier',
          subtitle: 'Combattant de première ligne',
          action:
            'Chargez l’ennemi le plus proche et gagnez de la puissance d’attaque supplémentaire.',
        },
        ES: {
          title: 'Guerrero',
          subtitle: 'Combatiente de primera línea',
          action: 'Carga contra el enemigo más cercano y gana poder de ataque adicional.',
        },
        DE: {
          title: 'Krieger',
          subtitle: 'Kämpfer an der Front',
          action:
            'Stürme auf den nächsten Feind zu und erhalte zusätzliche Angriffskraft.',
        },
        NL: {
          title: 'Krijger',
          subtitle: 'Frontlijnvechter',
          action: 'Storm op de dichtstbijzijnde vijand af en krijg extra aanvalskracht.',
        },
        IT: {
          title: 'Guerriero',
          subtitle: 'Combattente in prima linea',
          action: 'Carica il nemico più vicino e ottieni potere d’attacco aggiuntivo.',
        },
      },
    },
    {
      id: 'sample-tactician',
      title: 'Tactician',
      subtitle: 'Battlefield Strategist',
      attack: 80,
      defense: 100,
      action: 'Increase the effectiveness of nearby allies.',
      image: null,
      zone: Zone.MIDFIELD,
      stars: 2,
      translations: {
        PT: {
          title: 'Tático',
          subtitle: 'Estrategista de Batalha',
          action: 'Aumente a eficácia dos aliados próximos.',
        },
        FR: {
          title: 'Tacticien',
          subtitle: 'Stratège de bataille',
          action: 'Augmentez l’efficacité des alliés proches.',
        },
        ES: {
          title: 'Táctico',
          subtitle: 'Estratega de batalla',
          action: 'Aumenta la eficacia de los aliados cercanos.',
        },
        DE: {
          title: 'Taktiker',
          subtitle: 'Schlachtfeldstratege',
          action: 'Erhöhe die Wirksamkeit verbündeter Karten in der Nähe.',
        },
        NL: {
          title: 'Strateeg',
          subtitle: 'Slagveldstrateeg',
          action: 'Verhoog de effectiviteit van nabije bondgenoten.',
        },
        IT: {
          title: 'Tattico',
          subtitle: 'Stratega di battaglia',
          action: 'Aumenta l’efficacia degli alleati vicini.',
        },
      },
    },
    {
      id: 'sample-guardian',
      title: 'Guardian',
      subtitle: 'Defensive Sentinel',
      attack: 60,
      defense: 150,
      action: 'Protect an allied card from the next attack.',
      image: null,
      zone: Zone.DEFENSE,
      stars: 1,
      translations: {
        PT: {
          title: 'Guardião',
          subtitle: 'Sentinela Defensiva',
          action: 'Proteja uma carta aliada do próximo ataque.',
        },
        FR: {
          title: 'Gardien',
          subtitle: 'Sentinelle défensive',
          action: 'Protégez une carte alliée de la prochaine attaque.',
        },
        ES: {
          title: 'Guardián',
          subtitle: 'Centinela defensivo',
          action: 'Protege una carta aliada del próximo ataque.',
        },
        DE: {
          title: 'Wächter',
          subtitle: 'Verteidigende Wache',
          action: 'Schütze eine verbündete Karte vor dem nächsten Angriff.',
        },
        NL: {
          title: 'Beschermer',
          subtitle: 'Verdedigende schildwacht',
          action: 'Bescherm een bondgenootkaart tegen de volgende aanval.',
        },
        IT: {
          title: 'Guardiano',
          subtitle: 'Sentinella difensiva',
          action: 'Proteggi una carta alleata dal prossimo attacco.',
        },
      },
    },
  ]
}
