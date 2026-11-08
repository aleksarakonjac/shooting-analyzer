// Serbian UI string table. Later tasks add keys; identifiers stay English.
export const sr = {
  appName: 'Dnevnik streljaštva',
  auth: {
    login: 'Prijava',
    register: 'Registracija',
    email: 'E-pošta',
    password: 'Lozinka',
    displayName: 'Ime i prezime',
    submitLogin: 'Prijavi se',
    submitRegister: 'Pošalji zahtev',
    noAccount: 'Nemate nalog?',
    haveAccount: 'Već imate nalog?',
    logout: 'Odjavi se',
    badCredentials: 'Pogrešna e-pošta ili lozinka.',
    registerFailed: 'Registracija nije uspela. Proverite podatke i pokušajte ponovo.',
    passwordHint: 'Najmanje 8 znakova.',
  },
  waiting: {
    title: 'Čeka se odobrenje',
    pending: 'Vaš zahtev je primljen. Administrator mora da odobri nalog pre prve upotrebe.',
    disabled: 'Vaš nalog je isključen. Obratite se administratoru.',
  },
  admin: {
    approvalsTitle: 'Odobrenja registracija',
    empty: 'Nema zahteva na čekanju.',
    approveShooter: 'Odobri kao strelca',
    approveCoach: 'Odobri kao trenera',
    reject: 'Isključi nalog',
    registered: 'Registrovan',
  },
} as const;

export type SrKey = keyof typeof sr;
