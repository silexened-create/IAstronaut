FROM php:8.2-apache

# Instalar y habilitar módulos de Apache
RUN a2enmod headers rewrite

# Configuración global de Apache para permitir CORS (El martillo definitivo)
RUN echo '<Directory "/var/www/html">\n\
    Header set Access-Control-Allow-Origin "https://i-astronaut.vercel.app"\n\
    Header set Access-Control-Allow-Methods "POST, GET, OPTIONS"\n\
    Header set Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With"\n\
    Header set Access-Control-Allow-Credentials "true"\n\
</Directory>' >> /etc/apache2/apache2.conf

COPY . /var/www/html/

EXPOSE 80
