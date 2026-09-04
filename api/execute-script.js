export default async function handler(req, res) {
    // 1. Le serveur récupère secrètement l'adresse et le mot de passe cachés dans sa mémoire
    const googleScriptUrl = process.env.APPS_SCRIPT_URL;
    const appSecret = process.env.APP_SECRET;

    // 2. Il récupère ce que l'élève ou le superviseur a demandé (ex: "voir mes notes")
    const clientData = req.body;

    // 3. Le serveur ajoute discrètement le mot de passe secret dans la demande
    const securePayload = {
        ...clientData,
        APP_SECRET: appSecret
    };

    try {
        // 4. Le serveur appelle Google Apps Script en cachette
        const googleResponse = await fetch(googleScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(securePayload)
        });

        const data = await googleResponse.json();
        
        // 5. Il renvoie la réponse de Google à l'élève
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: "Erreur de connexion sécurisée" });
    }
}
