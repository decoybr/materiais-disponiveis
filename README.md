# 🎖️ Materiais Disponíveis
**Criado por CHAVES**

Versão ONLINE — todos veem as mesmas informações.

## Credenciais padrão
- Usuário ADM: `admin`
- Senha ADM: `admin123`
- Senha Mestre: `mestreCHAVES`

## Como colocar ONLINE no Render (gratuito)

### Passo a passo:

1. Acesse https://render.com e crie uma conta (pode usar Google)

2. Clique em **New +** → **Web Service**

3. Escolha **Build and deploy from a Git repository**  
   (ou use a opção de upload se aparecer)

   **Forma mais fácil sem GitHub:**
   - No Render, escolha **New +** → **Web Service**
   - Se pedir repositório, você pode criar um repositório gratuito no GitHub:
     a) Acesse https://github.com → New repository
     b) Nome: materiais-disponiveis
     c) Deixe público
     d) Faça upload da pasta `materiais-chaves` (todos os arquivos)
     e) Volte no Render e conecte esse repositório

4. Configurações no Render:
   - **Name**: materiais-disponiveis (ou qualquer nome)
   - **Runtime**: Node
   - **Build Command**: (deixe em branco)
   - **Start Command**: `node server.js`
   - **Instance Type**: Free

5. Clique em **Create Web Service**

6. Espere alguns minutos. O Render vai gerar um link tipo:
   `https://materiais-disponiveis.onrender.com`

7. Pronto! Compartilhe esse link com todo mundo.

### Importante:
- No plano gratuito o site “dorme” após 15 min sem uso.
- O primeiro acesso depois de dormir pode demorar 30–60 segundos.
- Os dados ficam salvos no servidor (todo mundo vê a mesma coisa).

## Rodar no computador (teste)
```bash
cd materiais-chaves
node server.js
```
Acesse http://localhost:3000
