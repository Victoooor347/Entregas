# Ordem de Carregamento — com login e admin

Site em **React** onde:
- qualquer pessoa com o link pode **criar uma conta** e fazer login
- qualquer pessoa logada pode **criar ordens de carregamento** e imprimir/salvar como PDF
- **só você** (marcado como admin no banco) vê as abas de **Caminhões** e **Produtos** para cadastrar e remover

O login, as contas e os dados ficam guardados no **Supabase** (banco de dados + autenticação, gratuito para esse porte de uso).

---

## 1. Criar o banco de dados (Supabase)

1. Crie uma conta em [supabase.com](https://supabase.com) e crie um novo projeto (escolha uma senha de banco, pode ser qualquer uma — você não vai precisar dela no dia a dia).
2. Espere o projeto terminar de provisionar (leva 1-2 minutos).
3. No menu lateral, abra **SQL Editor** → **New query**.
4. Cole o conteúdo do arquivo `schema.sql` (está na raiz deste projeto) e clique em **Run**.
   - Isso cria as tabelas de caminhões, produtos, ordens e o sistema de permissões (quem é admin, quem é usuário comum).
5. No menu lateral, vá em **Project Settings → API**. Copie:
   - **Project URL**
   - **anon public key**

---

## 2. Configurar o projeto no seu computador

Você vai precisar do **[Node.js](https://nodejs.org/)** instalado (versão LTS).

```bash
# dentro da pasta do projeto
npm install
cp .env.example .env
```

Abra o arquivo `.env` recém-criado e cole a URL e a chave que você copiou do Supabase:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Rode localmente para testar:

```bash
npm run dev
```

Abra o endereço que aparecer no terminal (geralmente `http://localhost:5173`).

---

## 3. Virar admin

1. No site rodando, crie sua própria conta normalmente (e-mail + senha), como se fosse um usuário qualquer.
   - **Atenção:** por padrão o Supabase exige confirmação por e-mail. Se quiser pular isso durante os testes, vá em **Authentication → Providers → Email** no painel do Supabase e desative "Confirm email" (você pode reativar depois).
2. No Supabase, abra o **SQL Editor** de novo e rode (trocando pelo seu e-mail):

```sql
update public.profiles set role = 'admin' where email = 'seu@email.com';
```

3. Saia e entre de novo no site. Agora as abas **Caminhões** e **Produtos** vão aparecer só para você.

Qualquer outra pessoa que criar conta pelo link entra como usuário comum: consegue montar e imprimir ordens, mas não vê as telas de cadastro.

---

## 4. Colocar no ar (para outras pessoas acessarem)

Mais simples: [Vercel](https://vercel.com) (gratuito).

1. Suba esta pasta para um repositório no GitHub.
2. Em vercel.com, clique em **Add New → Project**, importe o repositório.
3. Em **Environment Variables**, adicione as mesmas duas variáveis do `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Clique em **Deploy**.

Em poucos minutos você recebe um link (tipo `ordem-carregamento.vercel.app`) que pode mandar para qualquer pessoa.

---

## Resumo do que precisa baixar/criar

| Item | Para quê | Custo |
|---|---|---|
| [Node.js](https://nodejs.org/) | rodar o projeto no seu computador | grátis |
| Conta no [Supabase](https://supabase.com) | login de usuários + banco de dados | grátis nesse porte |
| Conta no [Vercel](https://vercel.com) (opcional) | publicar o site com link próprio | grátis |
| Conta no [GitHub](https://github.com) (opcional) | guardar o código para o Vercel publicar | grátis |

---

## Estrutura dos arquivos

```
ordem-carregamento/
├─ schema.sql          ← rodar no Supabase (tabelas + permissões)
├─ .env.example        ← copiar para .env e preencher
├─ package.json
├─ vite.config.js
├─ index.html
└─ src/
   ├─ main.jsx
   ├─ supabaseClient.js
   ├─ Auth.jsx          ← tela de login/cadastro
   └─ App.jsx            ← app principal (ordens, caminhões, produtos)
```
