<script setup lang="ts">
withDefaults(
  defineProps<{
    attack: number
    defense: number
    attackLabel?: string
    defenseLabel?: string
  }>(),
  {
    attackLabel: 'Attack',
    defenseLabel: 'Defense',
  },
)
</script>

<template>
  <div class="card-stats">
    <div class="card-stat card-stat--attack">
      <span class="card-stat__icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 7.8 15.99 10.7 14.47 15.4H9.53L8.01 10.7Z" />
          <path d="M12 2v5.8" />
          <path d="m21.51 8.91-5.52 1.79" />
          <path d="m17.88 20.09-3.41-4.69" />
          <path d="m6.12 20.09 3.41-4.69" />
          <path d="m2.49 8.91 5.52 1.79" />
        </svg>
      </span>
      <span class="card-stat__body">
        <span class="card-stat__label">{{ attackLabel }}</span>
        <span class="card-stat__value">{{ attack }}</span>
      </span>
    </div>

    <div class="card-stat card-stat--defense">
      <span class="card-stat__icon">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
          />
        </svg>
      </span>
      <span class="card-stat__body">
        <span class="card-stat__label">{{ defenseLabel }}</span>
        <span class="card-stat__value">{{ defense }}</span>
      </span>
    </div>
  </div>
</template>
