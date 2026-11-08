# Clube Secreto VIP — Guia de Deploy na VPS Coolify

Este guia ensina o passo a passo para colocar o **Clube Secreto VIP** no ar no seu domínio **`omelhorvendedor.online`** ou **`omelhorvendedoronline.com.br`** (subdomínio recomendado: **`https://clube.omelhorvendedoronline.com.br`**), com SSL HTTPS automático, painel de administração CMS e banco de códigos persistente.

---

## 1. Apontamento de DNS na Hostinger (1 Minuto)

1. Acesse o painel da **Hostinger** (hPanel).
2. Vá em **Domínios** ➔ selecione `omelhorvendedoronline.com.br` (ou `omelhorvendedor.online`).
3. No menu lateral esquerdo, clique em **DNS / Gerenciamento de DNS**.
4. Crie um novo registro **Tipo A**:
   - **Tipo**: `A`
   - **Nome**: `clube` (ou `vip`)
   - **Aponta para (IP)**: `[IP DA SUA VPS COOLIFY]` *(o mesmo IP que você já usa no CRM e nas Novelinhas)*
   - **TTL**: `300` (ou padrão)
5. Clique em **Adicionar Registro**.

> 💡 **Resultado**: O endereço `clube.omelhorvendedoronline.com.br` agora responde direto na sua VPS!

---

## 2. Subir no Painel Coolify (2 Minutos)

1. Acesse o painel web do seu **Coolify** na VPS (ex: `http://SEU_IP:8000`).
2. Entre no seu **Projeto** (ou crie um chamado `Clube Secreto VIP`).
3. Clique em **+ New Resource** ➔ **Application**.
4. Escolha a origem:
   - **GitHub Repository**: Conecte o repositório ou pasta `creators-vip`.
   - *(Ou **Docker Compose**: cole o conteúdo do `docker-compose.yml`)*.
5. Na tela de configuração da aplicação:
   - **Domains**: `https://clube.omelhorvendedoronline.com.br`
   - **Port**: `3008`
6. Em **Storage / Persistent Volumes** (Importante para não perder uploads e códigos):
   - Volume 1: `./config:/app/config`
   - Volume 2: `./media:/app/media`
   - Volume 3: `./catalog.js:/app/catalog.js`
7. Clique em **Deploy**!

O Coolify vai:
- Construir a imagem Docker (`node:20-alpine`) em menos de 10 segundos (zero dependências pesadas).
- Solicitar e instalar o certificado SSL HTTPS (Let's Encrypt) automaticamente.
- Colocar a plataforma online com roteamento seguro.

---

## 3. Acessos do Administrador

- **Site Oficial**: `https://clube.omelhorvendedoronline.com.br`
- **Painel CMS Master**: `https://clube.omelhorvendedoronline.com.br/admin`
- **Chave Master do Admin**: `ADM-CLUBE-98319-LUAN-X99`
- **PIX Oficial de Recebimento**: CPF `09658990983` (Luan Batista)
- **WhatsApp Oficial de Vendas**: `554195993007`

---

## 4. O que Você Pode Fazer no Painel CMS (`/admin`):

1. **Modelos & Ensaios**:
   - Criar novas criadoras (Mia, Danny, etc.), definir preços (R$ 9,90 ou outro valor) e badges.
   - Editar títulos e biografias.
   - Excluir modelos com 1 clique.
2. **Gerenciador de Mídias (Prévias vs. VIP)**:
   - Alternar com 1 toque se uma foto/vídeo é **👁️ Prévia Grátis** (amostra para atrair o cliente) ou **🔒 Exclusivo VIP** (bloqueada até o pagamento).
   - Definir foto como Capa ou Avatar de perfil da criadora.
   - Fazer upload de novas fotos e vídeos de até 100MB por envio direto pelo navegador.
3. **Gerador de Códigos PIX de Uso Único**:
   - Gerar pacotes de 10 em 10 códigos com 1 clique.
   - Botão **"📲 Mensagem Pronta WhatsApp"**: copia a mensagem formatada com o link do site e o código do cliente pronta para disparar!

