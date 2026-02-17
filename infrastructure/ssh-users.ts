

const allUsers: Record<string, string> = {
    'golmschenk': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKBFzgMwHjOoGPJhNjd6miKPQGUxKaUrORDuQwZ6Zmur greg@golmschenk.com'
}

export function getUsernamesAndSshKeysRecord(usernames: [string]): Record<string, string> {
    const usernamesAndSshKeysRecord: Record<string, string> = {}
    for (const username of usernames) {
        usernamesAndSshKeysRecord[username] = allUsers[username]
    }
    return usernamesAndSshKeysRecord
}
